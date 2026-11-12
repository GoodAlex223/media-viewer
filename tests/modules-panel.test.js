// v2 P1a: the Modules section of F1 (core/modules-panel.js), spec § 10 (the P1a part; plan C4, C10). The row model
// turns main's list and the host's outcomes into what each row says; the panel builds it with createElement and
// textContent only, saves a toggle through main, and shows "Restart now" while a toggle waits for a restart.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { describeModuleRows, ModulesPanel } from '../core/modules-panel.js';

function row(id, extra = {}) {
    return {
        id,
        name: `Mod ${id}`,
        version: '1.0.0',
        description: `About ${id}`,
        root: 'e2e',
        entryPath: `modules/${id}/ui/index.js`,
        status: 'enabled',
        reason: null,
        enabledAtLaunch: true,
        enabledNext: true,
        defaultEnabled: false,
        requires: [],
        optional: [],
        folderFiles: [],
        ...extra,
    };
}
const listOf = (modules, restartNeeded = false) => ({ apiVersions: [1], order: [], restartNeeded, modules });
const outcomes = (map) => (id) => map[id] ?? null;

describe('describeModuleRows', () => {
    it('is empty for a missing list and for a list with no modules', () => {
        expect(describeModuleRows(null, () => null)).toEqual({ empty: true, restartNeeded: false, rows: [] });
        expect(describeModuleRows(listOf([]), () => null)).toEqual({ empty: true, restartNeeded: false, rows: [] });
    });

    it.each([
        [
            'invalid',
            row('a', { status: 'invalid', reason: 'id: x does not equal its folder name a' }),
            null,
            'Not valid: id: x does not equal its folder name a',
        ],
        ['off', row('a', { status: 'off', enabledAtLaunch: false, enabledNext: false }), null, 'Off'],
        [
            'blocked by main',
            row('a', { status: 'blocked', reason: 'disabled because b is off' }),
            null,
            'Disabled because b is off',
        ],
        ['enabled and active', row('a'), { state: 'active', reason: null }, 'On'],
        [
            'enabled and failed',
            row('a'),
            { state: 'failed', reason: 'did not finish activating within 5 s' },
            'Failed: did not finish activating within 5 s',
        ],
        [
            'enabled and blocked by the host',
            row('a'),
            { state: 'blocked', reason: 'disabled because b failed to start' },
            'Disabled because b failed to start',
        ],
        ['enabled, never started', row('a'), null, 'Not started'],
    ])('says %s', (_label, r, outcome, status) => {
        const model = describeModuleRows(listOf([r]), outcomes({ a: outcome }));
        expect(model.empty).toBe(false);
        expect(model.rows[0].status).toBe(status);
    });

    it('says restart to apply when the next launch differs from this one', () => {
        const model = describeModuleRows(
            listOf([row('a', { status: 'off', enabledAtLaunch: false, enabledNext: true })], true),
            () => null
        );
        expect(model.rows[0]).toMatchObject({ checked: true, status: 'Off — restart to apply' });
        expect(model.restartNeeded).toBe(true);
    });

    it('checks the box by the next launch, and disables it only for an invalid module', () => {
        const model = describeModuleRows(
            listOf([
                row('a', { enabledNext: false }),
                row('b', { status: 'invalid', reason: 'x', enabledAtLaunch: false, enabledNext: false }),
                row('c', { status: 'blocked', reason: 'requires d, which is not installed' }),
            ]),
            () => null
        );
        expect(model.rows.map((r) => [r.id, r.checked, r.toggleDisabled])).toEqual([
            ['a', false, false],
            ['b', false, true],
            ['c', true, false],
        ]);
        expect(model.rows[0]).toMatchObject({ name: 'Mod a', version: '1.0.0', description: 'About a' });
    });
});

// A few DOM pieces: elements with children, text, a class, listeners and the form fields the panel uses.
function el(tag) {
    const listeners = {};
    const node = {
        tag,
        id: '',
        className: '',
        textContent: '',
        type: '',
        checked: false,
        disabled: false,
        hidden: false,
        children: [],
        append(...nodes) {
            node.children.push(...nodes);
        },
        replaceChildren(...nodes) {
            node.children = [...nodes];
        },
        addEventListener(type, fn) {
            (listeners[type] ??= []).push(fn);
        },
        fire(type) {
            for (const fn of listeners[type] ?? []) {
                fn({ target: node });
            }
        },
        get text() {
            return [node.textContent, ...node.children.map((c) => c.text)].join(' ').trim();
        },
        find(pred) {
            for (const c of node.children) {
                if (pred(c)) {
                    return c;
                }
                const hit = c.find(pred);
                if (hit) {
                    return hit;
                }
            }
            return null;
        },
    };
    return node;
}

describe('ModulesPanel', () => {
    let savedDocument;
    let root, listEl, bar, restartBtn;

    beforeEach(() => {
        savedDocument = globalThis.document;
        globalThis.document = { createElement: (tag) => el(tag) };
        listEl = el('div');
        bar = el('div');
        bar.hidden = true;
        restartBtn = el('button');
        root = el('div');
        root.querySelector = (sel) =>
            ({ '#modulesList': listEl, '#modulesRestartBar': bar, '#modulesRestartBtn': restartBtn })[sel] ?? null;
    });
    afterEach(() => {
        globalThis.document = savedDocument;
    });

    function panel(list, over = {}) {
        const deps = {
            root,
            api: { setModuleEnabled: vi.fn(async () => listOf([], false)) },
            notify: vi.fn(),
            getList: () => list,
            outcomeOf: () => ({ state: 'active', reason: null }),
            requestRestart: vi.fn(),
            ...over,
        };
        return { p: new ModulesPanel(deps), deps };
    }
    const box = () => listEl.find((n) => n.tag === 'input');

    it('says "No modules yet" for an empty list, and hides the restart bar', () => {
        const { p } = panel(listOf([]));
        p.render();
        expect(listEl.text).toBe('No modules yet');
        expect(bar.hidden).toBe(true);
    });

    it('renders a row with its name, description and status, as text', () => {
        const { p } = panel(listOf([row('a')]));
        p.render();
        expect(listEl.text).toContain('Mod a');
        expect(listEl.text).toContain('About a');
        expect(listEl.text).toContain('On');
        expect(box()).toMatchObject({ type: 'checkbox', checked: true, disabled: false });
    });

    it('saves a toggle, then shows the new list and the restart bar', async () => {
        const after = listOf([row('a', { enabledNext: false })], true);
        const { p, deps } = panel(listOf([row('a')]), {
            api: { setModuleEnabled: vi.fn(async () => after) },
        });
        p.render();
        box().checked = false;
        box().fire('change');
        await vi.waitFor(() => expect(bar.hidden).toBe(false));
        expect(deps.api.setModuleEnabled).toHaveBeenCalledWith('a', false);
        expect(listEl.text).toContain('On — restart to apply');
        expect(box().checked).toBe(false);
    });

    it.each([
        ['a refusal', async () => ({ success: false, error: 'Not permitted' }), 'Not permitted'],
        ['an error', async () => ({ error: 'disk full' }), 'disk full'],
        ['no reply', async () => null, 'no reply'],
        ['a rejection', async () => Promise.reject(new Error('ipc closed')), 'ipc closed'],
    ])('puts the box back and says so on %s', async (_label, impl, why) => {
        const { p, deps } = panel(listOf([row('a')]), { api: { setModuleEnabled: vi.fn(impl) } });
        p.render();
        box().checked = false;
        box().fire('change');
        await vi.waitFor(() => expect(deps.notify).toHaveBeenCalled());
        expect(deps.notify).toHaveBeenCalledWith(`Could not save the module setting: ${why}`, 'error');
        expect(box().checked).toBe(true);
        expect(box().disabled).toBe(false);
        expect(bar.hidden).toBe(true);
    });

    it('Restart now asks for the restart', () => {
        const { p, deps } = panel(listOf([row('a')], true));
        p.render();
        expect(bar.hidden).toBe(false);
        restartBtn.fire('click');
        expect(deps.requestRestart).toHaveBeenCalledOnce();
    });

    it('does nothing without its section', () => {
        const { p } = panel(listOf([row('a')]), { root: null });
        expect(() => p.render()).not.toThrow();
    });
});
