// v2 P1a E2E fixture module (tests/e2e/modules.test.js). Loaded only from the E2E module root.
export function activate(host) {
    return {
        testApi: { activated: true, hostKeys: Object.keys(host).sort() },
        deactivate() {},
    };
}
