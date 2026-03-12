/**
 * Preload script that sets --remote-debugging-port via app.commandLine.appendSwitch
 * instead of CLI flag (which Electron 30+ rejects).
 * Also loads Playwright's original loader for app.whenReady() interception.
 *
 * See: https://github.com/microsoft/playwright/issues/39008
 */

const { app } = require('electron');
const path = require('path');

// Set remote debugging port via Chromium switch API (Electron 30+ requires this)
app.commandLine.appendSwitch('remote-debugging-port', '0');

// Load Playwright's original loader for app lifecycle interception.
// This is an internal path — if it breaks after a playwright-core upgrade,
// update this path or check https://github.com/microsoft/playwright/issues/39008
const loaderPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'node_modules',
    'playwright-core',
    'lib',
    'server',
    'electron',
    'loader.js'
);
const fs = require('fs');
if (!fs.existsSync(loaderPath)) {
    throw new Error(
        `playwright-core loader not found at: ${loaderPath}\n` +
            'The internal path may have changed after a playwright-core upgrade.\n' +
            'Update rdp-preload.cjs to match the new location.'
    );
}
require(loaderPath);
