// v2 P1a: the module channels (spec §§ 6.5, 8.1, 8.2). Every one registers through the IPC guard, so the sender must
// be the app page and each argument passes its kind before the registry or the folder-file service runs.
//
// A folder file is named by its owner and its declared name: the owner must be a module active this launch (there is
// no 'core' owner in P1a: core's own folder files keep their channels, plan C2), and the name must be one that module
// declared in module.json. The service checks the declaration again (main/folder-files.js).
'use strict';

const REFUSED_READ = Object.freeze({ status: 'unreadable', reason: 'Not permitted' });

/**
 * @param {object} deps
 * @param {ReturnType<typeof import('../ipc-guard').createIpcGuard>} deps.guard
 * @param {ReturnType<typeof import('./module-registry').createModuleRegistry>} deps.registry
 * @param {ReturnType<typeof import('./folder-files').createFolderFiles>} deps.folderFiles
 */
function registerModuleIpc({ guard, registry, folderFiles }) {
    const { kinds, oneOf } = guard;
    const ownerKind = (v) => typeof v === 'string' && registry.isActive(v);
    const declaredName = (v, args) => kinds.basename(v) && registry.folderFileDecl(args[0], v) !== null;

    guard.handle('list-modules', [], () => registry.list(), { rejectValue: null });

    // The toggle is written now and takes effect on the next launch.
    guard.handle('set-module-enabled', [kinds.string, oneOf(true, false)], (_event, id, enabled) =>
        registry.setEnabled(id, enabled)
    );

    // A refused read is "unreadable", never "absent": a module that took a refusal for a missing file would save
    // over data it never read (Review Focus 1).
    guard.handle(
        'folder-file-read',
        [ownerKind, kinds.grantedPath, declaredName],
        (_event, owner, folderPath, name) => folderFiles.read(owner, folderPath, name),
        { rejectValue: REFUSED_READ }
    );
    guard.handle(
        'folder-file-write',
        [ownerKind, kinds.grantedPath, declaredName, kinds.any],
        (_event, owner, folderPath, name, value) => folderFiles.write(owner, folderPath, name, value)
    );
    guard.handle(
        'folder-file-delete',
        [ownerKind, kinds.grantedPath, declaredName],
        (_event, owner, folderPath, name) => folderFiles.remove(owner, folderPath, name)
    );
}

module.exports = { registerModuleIpc };
