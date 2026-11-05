// The application menu leaves out the roles that would reload the page (PR #95 review 13).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { appMenuTemplate } = require('../app-menu');

const roles = (items) => items.flatMap((item) => [item.role, ...(item.submenu ? roles(item.submenu) : [])]);

describe('appMenuTemplate', () => {
    for (const platform of ['win32', 'darwin', 'linux']) {
        it(`has no reload role on ${platform}`, () => {
            const found = roles(appMenuTemplate(platform)).map((role) => role?.toLowerCase());
            expect(found).not.toContain('reload');
            expect(found).not.toContain('forcereload');
            expect(found).toContain('toggledevtools');
        });
    }

    it('adds the app menu only on macOS', () => {
        expect(roles(appMenuTemplate('darwin'))).toContain('appMenu');
        expect(roles(appMenuTemplate('win32'))).not.toContain('appMenu');
    });
});
