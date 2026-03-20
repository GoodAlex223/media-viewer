/**
 * Wrapper script that launches Electron with corrected arguments.
 * Strips --remote-debugging-port=0 from CLI (rejected by Electron 30+)
 * and adds -r rdp-preload.cjs which sets it via app.commandLine.appendSwitch.
 *
 * See: https://github.com/microsoft/playwright/issues/39008
 */

const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');
const rdpPreloadPath = path.resolve(__dirname, 'rdp-preload.cjs');

// Filter out --remote-debugging-port=0 from Playwright's injected args
const args = process.argv.slice(2).filter((arg) => arg !== '--remote-debugging-port=0');

// Add our custom preload that sets the flag via app.commandLine + loads Playwright's loader
args.unshift('-r', rdpPreloadPath);

// Ensure ELECTRON_RUN_AS_NODE is unset so Electron runs as a proper Electron app
// (not as a plain Node.js process). This env var may be inherited from the parent
// (e.g., Claude Code, VS Code terminals, or other Node-based tools).
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
});

// Forward stdio so Playwright can read the debugger URLs
child.stdout.on('data', (data) => process.stdout.write(data));
child.stderr.on('data', (data) => process.stderr.write(data));
if (process.stdin.readable) {
    process.stdin.pipe(child.stdin);
} else {
    child.stdin.end();
}

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
    console.error('electron-wrapper error:', err);
    process.exit(1);
});
