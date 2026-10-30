// Pre-push renderer line ratchet.
//
// Reads git's pre-push stdin (one `<local_ref> <local_sha> <remote_ref> <remote_sha>` line per pushed
// ref) and, for each branch being pushed, measures `media-viewer.js` on the merge of that tip into
// `origin/main` (`git merge-tree --write-tree`, so the count is what the PR would land, not what the
// branch carries), against the ceiling committed in `scripts/renderer-line-ceiling.txt`, read from the
// same merge. Over the ceiling refuses the push. Under it passes with a reminder to lower the ceiling,
// except on `refs/heads/main`, where it refuses until the ceiling equals the count.
//
// Fails closed: a failed fetch or merge, an unreadable or unparsable file, or a malformed ref line
// refuses the push (`SKIP=ratchet git push` is the bypass). A conflict in the renderer or the ceiling
// file refuses too, since the merge's blob then carries conflict markers. It never writes the ceiling.
// Exit 0 passes and exit 1 refuses; every message goes to stderr.
//
// `countLines`, `parseCeiling`, `selectUpdates`, `parseMergeTree` and `decide` are pure and unit-tested;
// the CLI section is a thin git wrapper.

const { spawnSync } = require('child_process');
const fs = require('fs');

const RENDERER = 'media-viewer.js';
const CEILING_FILE = 'scripts/renderer-line-ceiling.txt';
const MAIN_REF = 'refs/heads/main';
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
 * every ref outside `refs/heads/` are dropped. A non-blank line that is not four fields with valid
 * shas throws: the ratchet cannot tell what such a push carries.
 * @param {string} stdin
 * @returns {Array<{localRef:string, localSha:string, remoteRef:string, remoteSha:string}>}
 */
function selectUpdates(stdin) {
    const updates = [];
    for (const raw of stdin.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const fields = line.split(/\s+/);
        const [localRef, localSha, remoteRef, remoteSha] = fields;
        if (fields.length !== 4 || !SHA.test(localSha) || !SHA.test(remoteSha)) {
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
    const waysOut = () =>
        say(
            `to push anyway: shrink ${RENDERER}, raise the ceiling in ${CEILING_FILE}, or skip this check once with SKIP=ratchet git push.`
        );

    // spawnSync, since exit 1 must not throw (merge-tree) and a missing path is an answer, not a failure.
    const git = (args, options = {}) => {
        const result = spawnSync('git', args, { maxBuffer: MAX_BUFFER, ...options });
        if (result.error) throw new Error(`git ${args[0]} failed: ${result.error.message}`);
        return result;
    };
    const text = (result) => result.stdout.toString('utf8').trim();

    // The blob at `path` in `tree`: a Buffer, or null when the tree has no such path.
    const readBlob = (tree, file) => {
        const spec = `${tree}:${file}`;
        const found = git(['rev-parse', '--verify', '--quiet', spec]);
        if (found.status === 1 && !found.stderr.length) return null;
        if (found.status !== 0) throw new Error(`cannot read ${file} from the merge`);
        const blob = git(['cat-file', 'blob', text(found)]);
        if (blob.status !== 0) throw new Error(`cannot read ${file} from the merge`);
        return blob.stdout;
    };

    const measure = () => {
        const updates = selectUpdates(fs.readFileSync(0, 'utf8'));
        if (updates.length === 0) return false;

        const fetched = git(['fetch', '--quiet', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main'], {
            timeout: 60_000,
            encoding: 'utf8',
        });
        if (fetched.status !== 0) {
            const detail = (fetched.stderr || '').trim().split('\n')[0];
            throw new Error(`could not fetch main from origin${detail ? ` (${detail})` : ''}`);
        }
        const originMain = git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main^{commit}']);
        if (originMain.status !== 0) throw new Error('cannot resolve origin/main');

        let refused = false;
        for (const { localSha, remoteRef } of updates) {
            const tip = git(['rev-parse', '--verify', '--quiet', `${localSha}^{commit}`]);
            if (tip.status !== 0) throw new Error(`cannot resolve ${localSha}`);

            const merge = git(
                ['merge-tree', '--write-tree', '--name-only', '--no-messages', text(originMain), text(tip)],
                {
                    encoding: 'utf8',
                }
            );
            const merged = parseMergeTree(merge.stdout, merge.status);
            if (!merged) throw new Error(`git could not merge ${localSha} into origin/main`);

            const conflicted = [RENDERER, CEILING_FILE].filter((file) => merged.conflicts.includes(file));
            if (conflicted.length > 0) {
                for (const file of conflicted)
                    say(`${remoteRef}: ${file} conflicts with origin/main — merge origin/main first`);
                refused = true;
                continue;
            }

            const renderer = readBlob(merged.tree, RENDERER);
            if (!renderer) throw new Error(`${RENDERER} is missing from the merge`);
            const ceilingBlob = readBlob(merged.tree, CEILING_FILE);
            if (!ceilingBlob) throw new Error(`${CEILING_FILE} is missing from the merge`);
            const ceiling = parseCeiling(ceilingBlob.toString('utf8'));
            if (ceiling === null) throw new Error(`${CEILING_FILE} does not parse`);

            const count = countLines(renderer);
            const head = `${remoteRef}: ${RENDERER} ${count} lines, ceiling ${ceiling}`;
            switch (decide(count, ceiling, remoteRef)) {
                case 'over':
                    say(`${head} — over by ${count - ceiling}`);
                    refused = true;
                    break;
                case 'lower':
                    say(`${head} — lower the ceiling to ${count}`);
                    refused = true;
                    break;
                case 'remind':
                    say(`${head} — lower the ceiling to ${count} before this reaches main`);
                    break;
                default:
                    say(`${head} — at the ceiling`);
            }
        }
        return refused;
    };

    try {
        if (measure()) {
            waysOut();
            process.exit(1);
        }
    } catch (err) {
        say(`cannot measure — ${err.message}. Refusing the push.`);
        waysOut();
        process.exit(1);
    }
}

module.exports = { RENDERER, CEILING_FILE, countLines, parseCeiling, selectUpdates, parseMergeTree, decide };
