// Drives the real media_viewer app for agents (Windows): launches it as `npm start` does (the project
// directory, so it runs as "media_viewer") on a throwaway profile, then runs one command per stdin line.
// Only the OS folder dialog is replaced: main's own handler still grants what it returns. See SKILL.md.
import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REAL_PROFILE = path.join(process.env.APPDATA ?? '', 'media_viewer');
const SHOT_DIR = process.env.SHOT_DIR || path.join(os.tmpdir(), 'mv-shots');
const FIXTURES = path.join(os.tmpdir(), 'mv-run-fixtures');
const IDLE =
    '!window.mediaViewer.isLoading && !window.mediaViewer.mediaNavigationInProgress && ' +
    '!window.mediaViewer._fileOpInFlight && !window.mediaViewer._folderLoadInFlight';

// ASCII-only fold, for a refusal check only (an over-broad match refuses more, never less).
const fold = (p) => path.resolve(p).replace(/[A-Z]/g, (c) => c.toLowerCase());

function parseArgs(argv) {
    const opts = { profile: null, copyReal: false, keep: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--profile') {
            opts.profile = argv[++i];
        } else if (argv[i] === '--copy-real-profile') {
            opts.copyReal = true;
        } else if (argv[i] === '--keep-profile') {
            opts.keep = true;
        } else {
            throw new Error(`unknown option ${argv[i]} (use --profile <dir>, --copy-real-profile, --keep-profile)`);
        }
    }
    return opts;
}

// A fresh temp profile by default; a copy of the real one on request; never the real one itself.
function prepareProfile(opts) {
    if (opts.profile) {
        if (fold(opts.profile) === fold(REAL_PROFILE)) {
            throw new Error('refusing to run on the real profile; use --copy-real-profile');
        }
        fs.mkdirSync(opts.profile, { recursive: true });
        return { dir: path.resolve(opts.profile), owned: false };
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-run-profile-'));
    if (opts.copyReal) {
        fs.cpSync(REAL_PROFILE, dir, { recursive: true });
    }
    return { dir, owned: true };
}

// Synthetic folders: source (10 images, a seeded .bulk_rated.json: s01, s02 good, s03 bad), like (4), dislike (4).
// Always FIXTURES, the driver's own folder, which it clears first.
async function makeFixtures(root) {
    const { default: sharp } = await import('sharp');
    fs.rmSync(root, { recursive: true, force: true });
    const image = (seed, rgb) => {
        const w = 320;
        const h = 240;
        const buf = Buffer.alloc(w * h * 3);
        let s = seed;
        const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 3;
                const ring = Math.sin(Math.hypot(x / w, y / h) * (10 + seed)) * 50;
                const n = (rnd() - 0.5) * 60;
                buf[i] = Math.max(0, Math.min(255, rgb[0] + ring + n));
                buf[i + 1] = Math.max(0, Math.min(255, rgb[1] - ring + n));
                buf[i + 2] = Math.max(0, Math.min(255, rgb[2] + n));
            }
        }
        return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 });
    };
    const warm = [200, 120, 60];
    const cool = [60, 120, 200];
    for (const d of ['source', 'like', 'dislike']) {
        fs.mkdirSync(path.join(root, d), { recursive: true });
    }
    for (let i = 1; i <= 10; i++) {
        await image(i, i % 2 ? warm : cool).toFile(path.join(root, 'source', `s${String(i).padStart(2, '0')}.jpg`));
    }
    for (let i = 1; i <= 4; i++) {
        await image(100 + i, warm).toFile(path.join(root, 'like', `l${i}.jpg`));
        await image(200 + i, cool).toFile(path.join(root, 'dislike', `d${i}.jpg`));
    }
    const rated = { version: 1, good: ['s01.jpg', 's02.jpg'], bad: ['s03.jpg'] };
    fs.writeFileSync(path.join(root, 'source', '.bulk_rated.json'), JSON.stringify(rated, null, 2));
}

async function launch(profileDir) {
    const env = Object.fromEntries(
        Object.entries(process.env).filter(([n]) => !/^MV_/i.test(n) && n.toUpperCase() !== 'ELECTRON_RUN_AS_NODE')
    );
    env.MV_USER_DATA_DIR = profileDir;
    // The E2E wrapper works around playwright#39008 (Electron rejects --remote-debugging-port=0).
    const app = await electron.launch({
        executablePath: path.join(REPO, 'tests', 'e2e', 'helpers', 'electron-wrapper.cmd'),
        args: [REPO],
        cwd: REPO,
        env,
        timeout: 60_000,
    });
    const page = await app.firstWindow();
    await page.waitForFunction(() => typeof window.mediaViewer !== 'undefined', null, { timeout: 30_000 });
    await app.evaluate(({ dialog }) => {
        global.__driverDialogQueue = [];
        dialog.showOpenDialog = async () => {
            const next = global.__driverDialogQueue.shift();
            return next ? { canceled: false, filePaths: [next] } : { canceled: true, filePaths: [] };
        };
    });
    return { app, page };
}

// Close the way the window's X does: main's window close, which runs the renderer's close flow first.
async function closeLikeUser(app, timeoutMs = 30_000) {
    const closed = new Promise((r) => app.once('close', r));
    const t0 = Date.now();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close()).catch(() => {});
    const winner = await Promise.race([closed.then(() => 'closed'), sleep(timeoutMs).then(() => 'timeout')]);
    if (winner === 'timeout') {
        const pid = app.process()?.pid;
        if (pid) {
            execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
        }
    }
    return { winner, ms: Date.now() - t0 };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Polls a string expression with page.evaluate. page.waitForFunction cannot take a string here: it builds a
// function inside the page, which the app's CSP (no 'unsafe-eval') refuses; evaluate goes through CDP.
async function poll(page, expr, ms) {
    const t0 = Date.now();
    let last;
    for (;;) {
        try {
            if (await page.evaluate(expr)) {
                return;
            }
            last = 'still false';
        } catch (e) {
            last = e.message.split('\n')[0];
        }
        if (Date.now() - t0 > ms) {
            throw new Error(`timed out after ${ms} ms (${last}): ${expr}`);
        }
        await sleep(100);
    }
}

function newestSessionLog(logsDir) {
    if (!fs.existsSync(logsDir)) {
        return null;
    }
    const logs = fs.readdirSync(logsDir).filter((n) => /^media-viewer-\d/.test(n));
    return logs.length ? path.join(logsDir, logs.sort().pop()) : null;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const profile = prepareProfile(opts);
    const logsDir = path.join(profile.dir, 'logs');
    const perfPath = path.join(logsDir, 'media-viewer-perf.log');
    const perfStart = fs.existsSync(perfPath) ? fs.readFileSync(perfPath, 'utf8').split('\n').length - 1 : 0;
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    console.log(`profile: ${profile.dir}${opts.copyReal ? ' (copy of the real profile)' : ''}`);

    let { app, page } = await launch(profile.dir);
    let failures = 0;
    const consoleLines = [];
    page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') {
            consoleLines.push(`${m.type()}: ${m.text()}`.slice(0, 400));
        }
    });
    page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message.trim()}`.slice(0, 400)));
    console.log('launched');

    const needApp = () => {
        if (!app) {
            throw new Error('the app is closed');
        }
    };
    const timeoutAndRest = (arg, fallback) => {
        const m = /^(\d+)\s+([\s\S]+)$/.exec(arg);
        return m ? [Number(m[1]), m[2]] : [fallback, arg];
    };

    // eval, expect and wait run the operator's own expressions in the app's page, on purpose: this is a test
    // driver, and its input is the agent's script, never content from the app or a folder.
    const COMMANDS = {
        async ss(name) {
            needApp();
            const file = path.join(SHOT_DIR, `${name || `ss-${Date.now()}`}.png`);
            await page.screenshot({ path: file });
            console.log('screenshot:', file);
        },
        async click(sel) {
            needApp();
            // A DOM click, not a coordinate click: the media overlay intercepts pointer events.
            const r = await page.evaluate((s) => {
                const el = document.querySelector(s);
                if (!el) {
                    return 'NOT_FOUND';
                }
                el.click();
                return 'OK';
            }, sel);
            if (r !== 'OK') {
                throw new Error(`click ${sel}: ${r}`);
            }
        },
        async key(k) {
            needApp();
            await page.keyboard.press(k);
        },
        async eval(expr) {
            needApp();
            console.log(JSON.stringify(await page.evaluate(expr)));
        },
        async expect(expr) {
            needApp();
            const value = await page.evaluate(expr);
            if (value) {
                console.log(`PASS  ${expr}`);
            } else {
                failures += 1;
                console.log(`FAIL  ${expr}  -> ${JSON.stringify(value)}`);
            }
        },
        async wait(arg) {
            needApp();
            const [ms, expr] = timeoutAndRest(arg, 30_000);
            await poll(page, expr, ms);
        },
        async idle(arg) {
            needApp();
            await poll(page, IDLE, Number(arg) || 30_000);
        },
        async text(sel) {
            needApp();
            console.log(await page.evaluate((s) => document.querySelector(s)?.innerText ?? '(not found)', sel));
        },
        async dialog(folder) {
            needApp();
            await app.evaluate((_e, p) => global.__driverDialogQueue.push(p), path.resolve(folder));
        },
        async open(folder) {
            await COMMANDS.dialog(folder);
            await page.evaluate(() => window.mediaViewer.openFolderDialog());
            await poll(page, IDLE, 60_000);
            console.log('mediaFiles:', await page.evaluate(() => window.mediaViewer.mediaFiles.length));
        },
        async fixtures() {
            await makeFixtures(FIXTURES);
            console.log('fixtures:', FIXTURES, '(source, like, dislike)');
        },
        async sleep(ms) {
            await sleep(Number(ms) || 1000);
        },
        console() {
            console.log(`console errors/warnings: ${consoleLines.length}`);
            consoleLines.splice(0).forEach((l) => console.log('  ' + l));
        },
        logs(n) {
            const session = newestSessionLog(logsDir);
            const lines = session ? fs.readFileSync(session, 'utf8').trimEnd().split('\n') : [];
            console.log(`session log ${session ?? '(none)'}:`);
            lines.slice(-(Number(n) || 20)).forEach((l) => console.log('  ' + l));
            const perf = fs.existsSync(perfPath) ? fs.readFileSync(perfPath, 'utf8').split('\n').slice(perfStart) : [];
            console.log('perf log, this run:');
            perf.filter(Boolean).forEach((l) => console.log('  ' + l));
        },
        async close() {
            needApp();
            const r = await closeLikeUser(app);
            console.log(`close: ${r.winner} after ${r.ms} ms`);
            if (r.winner !== 'closed') {
                failures += 1;
            }
            app = null;
            page = null;
        },
        help() {
            console.log('commands:', Object.keys(COMMANDS).join(', '));
        },
    };

    // One line at a time, each awaited: a pipe or a heredoc runs as a script. {fixtures} expands to the
    // fixtures folder.
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const raw of rl) {
        const line = raw.trim().replaceAll('{fixtures}', FIXTURES);
        if (!line || line.startsWith('#')) {
            continue;
        }
        console.log(`> ${line}`);
        const [cmd, ...rest] = line.split(/\s+/);
        const fn = COMMANDS[cmd];
        if (!fn) {
            failures += 1;
            console.log(`ERROR: unknown command ${cmd}; try help`);
            continue;
        }
        try {
            await fn(line.slice(cmd.length).trim());
        } catch (e) {
            failures += 1;
            console.log(`ERROR: ${e.message.split('\n')[0]}`);
        }
    }

    if (app) {
        await COMMANDS.close();
    }
    if (profile.owned && !opts.keep) {
        fs.rmSync(profile.dir, { recursive: true, force: true });
    } else {
        console.log(`profile kept: ${profile.dir}`);
    }
    console.log(failures ? `done: ${failures} failed` : 'done: all passed');
    process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
    console.error('driver failed:', e.message);
    process.exitCode = 1;
});
