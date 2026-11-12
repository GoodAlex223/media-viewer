// v2 P1a E2E fixture module (tests/e2e/modules.test.js). Loaded only from the E2E module root.
// Records every visit, and exposes its folder file for the newest visit, or for any recorded one.
export function activate(host) {
    const visits = [];
    const ended = [];
    host.folder.onLoaded((visit) => visits.push(visit));
    host.folder.onVisitEnd((visit) => ended.push(visit.folder));
    const file = host.store.folderFile('.e2e_module_state.json');
    const newest = () => visits[visits.length - 1];
    return {
        testApi: {
            visitFolders: () => visits.map((v) => v.folder),
            ended: () => [...ended],
            read: () => file.read(newest()),
            write: (value) => file.write(newest(), value),
            remove: () => file.delete(newest()),
            writeTo: (index, value) => file.write(visits[index], value),
            readUndeclared: () => {
                try {
                    host.store.folderFile('.not_declared.json');
                    return 'no error';
                } catch (err) {
                    return err.message;
                }
            },
        },
    };
}
