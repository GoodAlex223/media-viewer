// The application menu: Electron's default without Reload and Force Reload. A reload fires no close event, so it
// would skip the save at quit and lose what the renderer still owes the disk (PR #95 review 13). The default's Help
// menu is left out too: it only links to Electron's own website.
function appMenuTemplate(platform = process.platform) {
    return [
        ...(platform === 'darwin' ? [{ role: 'appMenu' }] : []),
        { role: 'fileMenu' },
        { role: 'editMenu' },
        {
            label: 'View',
            submenu: [
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        { role: 'windowMenu' },
    ];
}

module.exports = { appMenuTemplate };
