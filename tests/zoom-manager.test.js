import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZoomManager } from '../zoom.js';

// ZoomManager (G3, spec docs/superpowers/specs/2026-10-26-g3-zoom-manager-extraction-design.md § 6.2), imported
// directly. Vitest runs in node, so media elements, popover nodes and `document` are small fakes.

function fakeMedia({ width = 200, height = 100 } = {}) {
    return {
        style: {},
        listeners: {},
        addEventListener(type, fn, opts) {
            this.listeners[type] = { fn, opts };
        },
        getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
        closest: () => null,
    };
}

function fakeEl(tag) {
    const classes = new Set();
    return {
        tagName: tag.toUpperCase(),
        children: [],
        listeners: {},
        style: {},
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
        },
        appendChild(child) {
            this.children.push(child);
            child.parentNode = this;
            return child;
        },
        addEventListener(type, fn) {
            (this.listeners[type] ??= []).push(fn);
        },
        remove: vi.fn(),
    };
}

function makeManager({ compare = false, media = {} } = {}) {
    const all = { single: fakeMedia(), left: fakeMedia(), right: fakeMedia(), ...media };
    const createIcons = vi.fn();
    const zm = new ZoomManager({ getMediaElement: (t) => all[t], isCompareMode: () => compare, createIcons });
    return { zm, media: all, createIcons };
}

const wheel = (deltaY) => ({ deltaY, clientX: 100, clientY: 50, preventDefault: vi.fn(), stopPropagation: vi.fn() });

describe('ZoomManager', () => {
    const originalDocument = globalThis.document;
    let ids;

    beforeEach(() => {
        ids = {};
        globalThis.document = {
            createElement: fakeEl,
            addEventListener: vi.fn(),
            getElementById: (id) => ids[id] ?? null,
        };
    });

    afterEach(() => {
        globalThis.document = originalDocument;
    });

    it('maps the slider logarithmically between 1 and 8', () => {
        const { zm } = makeManager();
        expect(zm.sliderToScale(0)).toBeCloseTo(1, 10);
        expect(zm.sliderToScale(100)).toBeCloseTo(8, 10);
        expect(zm.sliderToScale(50)).toBeCloseTo(Math.sqrt(8), 10);
        expect(zm.scaleToSlider(zm.sliderToScale(37))).toBeCloseTo(37, 10);
        expect(zm.scaleToSlider(0.5)).toBe(0);
        expect(zm.scaleToSlider(20)).toBeCloseTo(100, 10);
    });

    it('setZoom clamps to [1, 8] and writes the transform and cursor', () => {
        const { zm, media } = makeManager();
        zm.setZoom('single', 20, 5, 6);
        expect(zm.state.single.scale).toBe(8);
        expect(media.single.style.transform).toBe('translate(5px, 6px) scale(8)');
        expect(media.single.style.cursor).toBe('grab');
        zm.setZoom('single', 0.2, 0, 0);
        expect(zm.state.single.scale).toBe(1);
        expect(media.single.style.cursor).toBe('default');
    });

    it("reset('all') resets every side", () => {
        const { zm } = makeManager();
        for (const t of ['single', 'left', 'right']) {
            zm.setZoom(t, 3, 10, 20);
        }
        zm.reset('all');
        for (const t of ['single', 'left', 'right']) {
            expect(zm.state[t]).toEqual({ scale: 1, translateX: 0, translateY: 0 });
        }
    });

    it('handleWheel prevents default, stops propagation and steps by 1.15', () => {
        const { zm } = makeManager();
        const e = wheel(-100);
        zm.handleWheel(e, 'single');
        expect(e.preventDefault).toHaveBeenCalledTimes(1);
        expect(e.stopPropagation).toHaveBeenCalledTimes(1);
        expect(zm.state.single.scale).toBeCloseTo(1.15, 10);
        zm.handleWheel(wheel(100), 'single');
        expect(zm.state.single.scale).toBeCloseTo(1, 10);
    });

    it('cycleStep goes 1 → 2 → 4 → 1', () => {
        const { zm } = makeManager();
        const scales = [];
        for (let i = 0; i < 3; i++) {
            zm.cycleStep('single', 100, 50);
            scales.push(zm.state.single.scale);
        }
        expect(scales).toEqual([2, 4, 1]);
    });

    it('isZoomed reads single in single mode and either side in compare mode', () => {
        const single = makeManager().zm;
        single.setZoom('left', 2, 0, 0);
        expect(single.isZoomed()).toBe(false);
        single.setZoom('single', 2, 0, 0);
        expect(single.isZoomed()).toBe(true);

        const compare = makeManager({ compare: true }).zm;
        expect(compare.isZoomed()).toBe(false);
        compare.setZoom('right', 2, 0, 0);
        expect(compare.isZoomed()).toBe(true);
    });

    it('isWrapperZoomed maps the wrapper class to its side', () => {
        const { zm } = makeManager();
        const wrapper = (cls) => ({ classList: { contains: (c) => c === cls } });
        zm.setZoom('left', 2, 0, 0);
        expect(zm.isWrapperZoomed(wrapper('left-media-wrapper'))).toBe(true);
        expect(zm.isWrapperZoomed(wrapper('right-media-wrapper'))).toBe(false);
        expect(zm.isWrapperZoomed(wrapper(null))).toBe(false); // no side class: the single-mode state
        zm.setZoom('single', 2, 0, 0);
        expect(zm.isWrapperZoomed(wrapper(null))).toBe(true);
    });

    it('handlePanStart refuses at 100% and grabs when zoomed', () => {
        const { zm, media } = makeManager();
        expect(zm.handlePanStart({ clientX: 0, clientY: 0 }, 'single')).toBe(false);
        expect(zm.isPanning).toBe(false);
        zm.setZoom('single', 2, 0, 0);
        expect(zm.handlePanStart({ clientX: 0, clientY: 0 }, 'single')).toBe(true);
        expect(zm.isPanning).toBe(true);
        expect(media.single.style.cursor).toBe('grabbing');
    });

    it('handlePanMove clamps translate to rect.width × (scale − 1) / 2', () => {
        const { zm, media } = makeManager({ media: { single: fakeMedia({ width: 400, height: 200 }) } });
        zm.setZoom('single', 2, 0, 0);
        zm.handlePanStart({ clientX: 0, clientY: 0 }, 'single');
        zm.handlePanMove({ clientX: 1000, clientY: 0 });
        expect(zm.state.single.translateX).toBe(200);
        expect(zm.state.single.translateY).toBe(0);
        zm.handlePanEnd();
        expect(zm.isPanning).toBe(false);
        expect(media.single.style.cursor).toBe('grab');
    });

    it('attachToMedia wires dblclick, a non-passive wheel and mousedown', () => {
        const { zm } = makeManager();
        const el = fakeMedia();
        zm.attachToMedia(el, 'left');
        expect(el.listeners.wheel.opts).toEqual({ passive: false });
        expect(el.listeners.dblclick).toBeDefined();
        expect(el.listeners.mousedown).toBeDefined();
        el.listeners.wheel.fn(wheel(-100));
        expect(zm.state.left.scale).toBeCloseTo(1.15, 10);
        expect(zm.state.single.scale).toBe(1);
    });

    it('createPopover builds [-] [slider] [+] [value] and registers the entry', () => {
        const { zm, createIcons } = makeManager();
        const wrapper = fakeEl('div');
        const btn = fakeEl('button');
        zm.createPopover('left', wrapper, btn);
        const popover = wrapper.children[0];
        expect(popover.className).toBe('zoom-popover');
        expect(popover.children.map((c) => c.className)).toEqual([
            'zoom-pop-btn',
            'zoom-slider',
            'zoom-pop-btn',
            'zoom-value',
        ]);
        expect(createIcons).toHaveBeenCalledWith(popover);
        expect(zm.popovers.left.toggleBtn).toBe(btn);
        expect(zm.popovers.left.container).toBe(popover);
    });

    it('the toggle opens and closes its popover', () => {
        const { zm } = makeManager();
        const btn = fakeEl('button');
        zm.createPopover('single', fakeEl('div'), btn);
        const { container } = zm.popovers.single;
        btn.listeners.click[0]({ stopPropagation: vi.fn() });
        expect(container.classList.contains('show')).toBe(true);
        btn.listeners.click[0]({ stopPropagation: vi.fn() });
        expect(container.classList.contains('show')).toBe(false);
    });

    it('hideAllPopovers hides every popover and keeps the entries', () => {
        const { zm } = makeManager();
        zm.createPopover('left', fakeEl('div'), fakeEl('button'));
        zm.createPopover('right', fakeEl('div'), fakeEl('button'));
        zm.popovers.left.container.classList.add('show');
        zm.popovers.right.container.classList.add('show');
        zm.hideAllPopovers();
        expect(zm.popovers.left.container.classList.contains('show')).toBe(false);
        expect(zm.popovers.right.container.classList.contains('show')).toBe(false);
        expect(Object.keys(zm.popovers)).toEqual(['left', 'right']);
    });

    describe('removePopover — dismisses the popover, keeps the button (G2)', () => {
        function entryFor(parentRemove) {
            return {
                abortController: { abort: vi.fn() },
                container: { parentNode: {}, remove: vi.fn() },
                toggleBtn: { parentNode: { remove: parentRemove } },
            };
        }

        it('does NOT remove the toggle button wrapper', () => {
            const parentRemove = vi.fn();
            const { zm } = makeManager();
            zm.popovers.left = entryFor(parentRemove);

            zm.removePopover('left');

            // This is the G2 contract: deleting the BUTTON is the caller's job. Doing it here used
            // to strip the zoom control from every tournament pair after the first, because
            // showTournamentPairFast calls cleanupCompareMedia (which calls this) and — before this
            // fix — never re-ran addMediaOverlayControls. It now does, right after the cleanup
            // phase, so this method stays free to be a pure "dismiss the popover" op.
            expect(parentRemove).not.toHaveBeenCalled();
        });

        it('still aborts listeners, removes the popover and forgets the entry', () => {
            const entry = entryFor(vi.fn());
            const { zm } = makeManager();
            zm.popovers.left = entry;

            zm.removePopover('left');

            expect(entry.abortController.abort).toHaveBeenCalled();
            expect(entry.container.remove).toHaveBeenCalled();
            expect(zm.popovers.left).toBeUndefined();
        });

        it('is a no-op for a target with no popover', () => {
            const { zm } = makeManager();
            expect(() => zm.removePopover('right')).not.toThrow();
        });
    });

    it('init builds the single popover and installs the three document listeners', () => {
        ids.zoomBtnWrapper = fakeEl('div');
        ids.zoomToggleBtn = fakeEl('button');
        const { zm } = makeManager();
        zm.init();
        expect(zm.popovers.single.toggleBtn).toBe(ids.zoomToggleBtn);
        // The popover's own slider mouseup carries an AbortSignal; the manager's three do not.
        const own = globalThis.document.addEventListener.mock.calls.filter((c) => c[2] === undefined).map((c) => c[0]);
        expect(own).toEqual(['click', 'mousemove', 'mouseup']);
    });
});
