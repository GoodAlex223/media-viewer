// Pre-push renderer line ratchet.
//
// Reads git's pre-push stdin (one `<local_ref> <local_sha> <remote_ref> <remote_sha>` line per pushed
// ref) and, for each branch being pushed, measures `media-viewer.js` on the merge of that tip into
// `origin/main` (`git merge-tree --write-tree`, so the count is what the PR would land, not what the
// branch carries), against the ceiling committed in `scripts/renderer-line-ceiling.txt`, read from the
// same merge. Over the ceiling refuses the push. Under it passes with a reminder to lower the ceiling,
// except on `refs/heads/main`, where it refuses until the ceiling equals the count.
//
// A main that is itself over its ceiling (two PRs that each fitted the slack, a SKIP, a web-UI commit)
// refuses only a push that adds lines to it, and says whose overage it is. A main with no ceiling file
// yet (before this check reaches it) passes with a note.
//
// Fails closed: a failed fetch or merge, an unreadable or unparsable file, a renderer or ceiling file
// that is not a regular file, or a malformed ref line refuses the push (`SKIP=ratchet git push` is the
// bypass, which the hook names). A conflict in the renderer or the ceiling file refuses too, since the
// merge's blob then carries conflict markers; a conflict elsewhere does not matter here and is measured
// past. It never writes the ceiling. Exit 0 passes and exit 1 refuses; every message goes to stderr.
//
// Needs git 2.38 or newer (`merge-tree --write-tree`). The fetch goes to a private ref,
// `refs/ratchet/origin-main`, so it never moves the user's own `origin/main` (the implicit lease of a
// later `--force-with-lease`) or `FETCH_HEAD`.
//
// `countLines`, `parseCeiling`, `selectUpdates`, `parseMergeTree` and `decide` are pure and unit-tested;
// the CLI section is a thin git wrapper.

const { spawnSync } = require('child_process');
const fs = require('fs');

const RENDERER = 'media-viewer.js';
const CEILING_FILE = 'scripts/renderer-line-ceiling.txt';
const MAIN_REF = 'refs/heads/main';
const FETCHED_MAIN = 'refs/ratchet/origin-main';
const PREFIX = 'pre-push ratchet: ';
// The default 1 MiB would truncate the renderer (over 500 kB today, and growing with the ceiling).
const MAX_BUFFER = 64 * 1024 * 1024;

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const ZERO_SHA = /^0+$/;

/**
 * The number of `\n` bytes, which is what `wc -l` counts.
 * @param {Buffer|string} content
 * @returns {number}
 */
function countLines(content) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    let count = 0;
    for (let at = buf.indexOf(10); at !== -1; at = buf.indexOf(10, at + 1)) count++;
    return count;
}

/**
 * The ceiling file's value: after a leading BOM, trimmed blank lines and `#` lines are skipped, and
 * exactly one line must remain, all digits, a safe integer of at least 1. Anything else is `null`.
 * @param {string} text
 * @returns {number|null}
 */
function parseCeiling(text) {
    const lines = text
        .replace(/^﻿/, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    if (lines.length !== 1 || !/^[0-9]+$/.test(lines[0])) return null;
    const value = Number(lines[0]);
    return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/**
 * The branch updates in git's pre-push stdin, keyed on the remote ref. Deletes (a zero local sha) and
 * every ref outside `refs/heads/` are dropped. A non-blank line that is not a local ref, two valid shas
 * and a remote ref throws: the ratchet cannot tell what such a push carries.
 *
 * Fields split on ASCII spaces only, taken from the right. The local ref is the source expression of
 * `git push origin '<expr>:<ref>'`, written verbatim, so it can hold spaces (`HEAD^{/fix the bug}`); `\s`
 * and `trim()` would also split a ref name on a no-break space, which `check-ref-format` accepts.
 * @param {string} stdin
 * @returns {Array<{localRef:string, localSha:string, remoteRef:string, remoteSha:string}>}
 */
function selectUpdates(stdin) {
    const updates = [];
    for (const raw of stdin.split('\n')) {
        const line = raw.replace(/\r$/, '');
        if (!line.trim()) continue;
        const fields = line.split(' ');
        const remoteSha = fields.pop();
        const remoteRef = fields.pop();
        const localSha = fields.pop();
        const localRef = fields.join(' ');
        if (!localRef || !remoteRef || !SHA.test(localSha) || !SHA.test(remoteSha)) {
            throw new Error(`malformed ref line: ${JSON.stringify(line)}`);
        }
        if (ZERO_SHA.test(localSha) || !remoteRef.startsWith('refs/heads/')) continue;
        updates.push({ localRef, localSha, remoteRef, remoteSha });
    }
    return updates;
}

/**
 * `git merge-tree --write-tree --name-only --no-messages` output: the merged tree on the first line,
 * then the conflicted paths. Exit 0 is clean and exit 1 is conflicted; any other status, or an exit 1
 * without a tree (git 2.38's answer to a ref it cannot resolve), means git did not merge → `null`.
 * @param {string} stdout
 * @param {number} status
 * @returns {{tree:string, conflicts:string[]}|null}
 */
function parseMergeTree(stdout, status) {
    if (status !== 0 && status !== 1) return null;
    const [tree, ...rest] = stdout.split('\n');
    if (!SHA.test(tree)) return null;
    const conflicts = rest.map((line) => line.trim()).filter(Boolean);
    // A clean merge lists no path, and a conflicted one always lists one.
    if ((status === 0) !== (conflicts.length === 0)) return null;
    return { tree, conflicts };
}

/**
 * @param {number} count the merged renderer's lines
 * @param {number} ceiling the merged ceiling
 * @param {string} remoteRef the ref being pushed to
 * @returns {'pass'|'remind'|'over'|'lower'} `lower` refuses a push to main whose ceiling is above its
 *   count; `remind` passes a branch with the same gap.
 */
function decide(count, ceiling, remoteRef) {
    if (count > ceiling) return 'over';
    if (count === ceiling) return 'pass';
    return remoteRef === MAIN_REF ? 'lower' : 'remind';
}

if (require.main === module) {
    const say = (text) => process.stderr.write(`${PREFIX}${text}\n`);

    // spawnSync, since exit 1 must not throw (merge-tree) and a missing path is an answer, not a failure.
    const git = (args, options = {}) => {
        const result = spawnSync('git', args, { maxBuffer: MAX_BUFFER, ...options });
        if (result.error) throw new Error(`git ${args[0]} failed: ${result.error.message}`);
        return result;
    };
    const text = (result) => result.stdout.toString('utf8').trim();

    // The blob at `file` in `tree`: a Buffer, or null when the tree has no such path. A path that is not a
    // regular file (a symlink would count as its link text, 0 lines) throws.
    const readBlob = (tree, file) => {
        const listed = git(['ls-tree', '-z', '--full-tree', tree, '--', file]);
        if (listed.status !== 0) throw new Error(`cannot read ${file} from the merge`);
        const entry = listed.stdout.toString('utf8').split('\0')[0];
        if (!entry) return null;
        const [mode, type, oid] = entry.split('\t')[0].split(' ');
        if (type !== 'blob' || (mode !== '100644' && mode !== '100755')) {
            throw new Error(`${file} is not a regular file in the merge`);
        }
        const blob = git(['cat-file', 'blob', oid]);
        if (blob.status !== 0) throw new Error(`cannot read ${file} from the merge`);
        return blob.stdout;
    };

    const measure = () => {
        const updates = selectUpdates(fs.readFileSync(0, 'utf8'));
        if (updates.length === 0) return null;

        // Into a private ref: `--refmap=` stops git from also updating `origin/main` (a fetch with an explicit
        // refspec still does, opportunistically) and `--no-write-fetch-head` leaves FETCH_HEAD alone, so a later
        // `--force-with-lease` keeps the lease the user earned. `--no-auto-maintenance` keeps a gc out of the
        // 60 s the fetch is allowed.
        const fetched = git(
            [
                'fetch',
                '--quiet',
                '--no-tags',
                '--no-write-fetch-head',
                '--no-auto-maintenance',
                '--refmap=',
                'origin',
                `+refs/heads/main:${FETCHED_MAIN}`,
            ],
            { timeout: 60_000, encoding: 'utf8' }
        );
        if (fetched.status !== 0) {
            const detail = (fetched.stderr || '').trim().split('\n')[0];
            throw new Error(`could not fetch main from origin${detail ? ` (${detail})` : ''}`);
        }
        const originMain = git(['rev-parse', '--verify', '--quiet', `${FETCHED_MAIN}^{commit}`]);
        if (originMain.status !== 0) throw new Error('cannot resolve origin/main');
        const mainTree = git(['rev-parse', '--verify', '--quiet', `${FETCHED_MAIN}^{tree}`]);
        if (mainTree.status !== 0) throw new Error('cannot resolve the tree of origin/main');

        // origin/main's own count and ceiling, read when the merge alone would mislead; null if unreadable.
        const mainState = () => {
            try {
                const renderer = readBlob(text(mainTree), RENDERER);
                const ceilingBlob = readBlob(text(mainTree), CEILING_FILE);
                const ceiling = ceilingBlob && parseCeiling(ceilingBlob.toString('utf8'));
                return renderer && ceiling ? { count: countLines(renderer), ceiling } : null;
            } catch (_err) {
                return null;
            }
        };

        const outcome = { refused: false, overAdvice: false };
        for (const { localSha, remoteRef } of updates) {
            const tip = git(['rev-parse', '--verify', '--quiet', `${localSha}^{commit}`]);
            if (tip.status !== 0) throw new Error(`cannot resolve ${localSha}`);

            const merge = git(
                [
                    'merge-tree',
                    '--write-tree',
                    '--name-only',
                    '--no-messages',
                    '--allow-unrelated-histories',
                    text(originMain),
                    text(tip),
                ],
                { encoding: 'utf8' }
            );
            const merged = parseMergeTree(merge.stdout, merge.status);
            if (!merged) {
                const detail = (merge.stderr || '').trim().split('\n')[0];
                throw new Error(
                    `git could not merge ${localSha} into origin/main${detail ? ` (${detail})` : ''}; ` +
                        'this check needs git 2.38 or newer'
                );
            }

            const conflicted = [RENDERER, CEILING_FILE].filter((file) => merged.conflicts.includes(file));
            if (conflicted.length > 0) {
                for (const file of conflicted)
                    say(`${remoteRef}: ${file} conflicts with origin/main — merge origin/main first`);
                outcome.refused = true;
                continue;
            }

            const renderer = readBlob(merged.tree, RENDERER);
            if (!renderer) throw new Error(`${RENDERER} is missing from the merge`);
            const ceilingBlob = readBlob(merged.tree, CEILING_FILE);
            if (!ceilingBlob) {
                // A merge that lacks the ceiling file is only a problem once main has one: before this check
                // reaches main, a branch cut without it has nothing to be measured against.
                if (readBlob(text(mainTree), CEILING_FILE) === null) {
                    say(
                        `${remoteRef}: origin/main has no ${CEILING_FILE} yet — nothing to measure against, not measured`
                    );
                    continue;
                }
                throw new Error(`${CEILING_FILE} is missing from the merge`);
            }
            const ceiling = parseCeiling(ceilingBlob.toString('utf8'));
            if (ceiling === null) throw new Error(`${CEILING_FILE} does not parse`);

            const count = countLines(renderer);
            const head = `${remoteRef}: ${RENDERER} ${count} lines, ceiling ${ceiling}`;
            switch (decide(count, ceiling, remoteRef)) {
                case 'over': {
                    const main = mainState();
                    const over = `${head} — over by ${count - ceiling}`;
                    if (main && main.count > main.ceiling) {
                        const itself = `origin/main is itself over its ceiling (${main.count} lines, ceiling ${main.ceiling})`;
                        if (count <= main.count) {
                            say(`${over}, but ${itself} and this push adds no lines. Fix main.`);
                            break;
                        }
                        say(`${over}. ${itself}.`);
                    } else {
                        say(over);
                    }
                    outcome.refused = true;
                    outcome.overAdvice = true;
                    break;
                }
                case 'lower':
                    // Shrinking or raising would widen the gap, so only the one remedy is named.
                    say(`${head} — lower the ceiling to ${count} in ${CEILING_FILE}`);
                    outcome.refused = true;
                    break;
                case 'remind':
                    say(`${head} — lower the ceiling to ${count} before this reaches main`);
                    break;
                default:
                    say(`${head} — at the ceiling`);
            }
        }
        return outcome;
    };

    try {
        const outcome = measure();
        if (outcome && outcome.refused) {
            // The hook names the SKIP token (check_failed), so only the remedy for being over is named here.
            if (outcome.overAdvice)
                say(`to get under the ceiling: shrink ${RENDERER}, or raise the ceiling in ${CEILING_FILE}.`);
            process.exit(1);
        }
    } catch (err) {
        say(`cannot measure — ${err.message}. Refusing the push.`);
        process.exit(1);
    }
}

module.exports = { RENDERER, CEILING_FILE, countLines, parseCeiling, selectUpdates, parseMergeTree, decide };
