import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { ZoomManager } from '../zoom.js';

// ZoomManager (G3, spec docs/superpowers/specs/2026-10-26-g3-zoom-manager-extraction-design.md § 6.2), imported
// directly. Vitest runs in node, so media elements, popover nodes and `document` are small fakes.

// A media element as the browser reports it: offsetWidth/offsetHeight are the layout box, while
// getBoundingClientRect() includes the element's own transform (translate, then scale about its centre).
// A static rect hid PR #90 review #2: the clamps read the scaled box, s times too loose.
function fakeMedia({ width = 200, height = 100 } = {}) {
    return {
        style: {},
        listeners: {},
        offsetWidth: width,
        offsetHeight: height,
        addEventListener(type, fn, opts) {
            this.listeners[type] = { fn, opts };
        },
        getBoundingClientRect() {
            const m = /translate\((-?[\d.e+-]+)px, (-?[\d.e+-]+)px\) scale\(([\d.e+-]+)\)/.exec(
                this.style.transform ?? ''
            );
            const [tx, ty, s] = m ? m.slice(1).map(Number) : [0, 0, 1];
            return {
                left: width / 2 + tx - (width * s) / 2,
                top: height / 2 + ty - (height * s) / 2,
                width: width * s,
                height: height * s,
            };
        },
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
        // No side class reads the single-mode state. No production path sends such a wrapper today (every
        // fullscreen.toggle caller passes the left or right wrapper); kept because the body moved verbatim (spec § 4.6).
        expect(zm.isWrapperZoomed(wrapper(null))).toBe(false);
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

    it('handlePanMove clamps translate to the layout width × (scale − 1) / 2', () => {
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

    // PR #90 review #2: the scaled box made the bound s × too loose (at 4× a drag emptied the pane).
    it('zoomAtPoint clamps translate to the layout box, not the scaled one', () => {
        const { zm } = makeManager({ media: { single: fakeMedia({ width: 400, height: 200 }) } });
        zm.setZoom('single', 4, 0, 0);
        zm.zoomAtPoint('single', 8, -2800, 100); // 3000 px left of centre: unclamped translateX would be 3000
        expect(zm.state.single.translateX).toBe(1400); // 400 × (8 − 1) / 2
    });

    // PR #90 review round 2: fitMediaToScreen gives media larger than the window a 100vw × 100vh box with
    // object-fit: contain, so the box is the window and the picture is letterboxed inside it. The bound must
    // follow the picture shown (natural size × the contain fit), or a drag leaves the screen blank at 4×.
    describe('letterboxed media: the bound follows the picture, not the box', () => {
        // A 4000 × 3000 photo in a 1600 × 900 box is shown at 1200 × 900.
        const letterboxed = () => Object.assign(fakeMedia({ width: 1600, height: 900 }), naturalSize(4000, 3000));
        const naturalSize = (w, h) => ({ naturalWidth: w, naturalHeight: h });

        it('handlePanMove', () => {
            const { zm } = makeManager({ media: { single: letterboxed() } });
            zm.setZoom('single', 4, 0, 0);
            zm.handlePanStart({ clientX: 0, clientY: 0 }, 'single');
            zm.handlePanMove({ clientX: 5000, clientY: 5000 });
            expect(zm.state.single.translateX).toBe(1800); // 1200 × (4 − 1) / 2, not the box's 2400
            expect(zm.state.single.translateY).toBe(1350); // 900 × (4 − 1) / 2
        });

        it('zoomAtPoint', () => {
            const { zm } = makeManager({ media: { single: letterboxed() } });
            zm.setZoom('single', 4, 0, 0);
            zm.zoomAtPoint('single', 8, -10000, 450); // far left of centre
            expect(zm.state.single.translateX).toBe(4200); // 1200 × (8 − 1) / 2, not the box's 5600
        });

        it('a letterboxed video reads videoWidth/videoHeight', () => {
            // A 1920 × 1080 video in a 1600 × 1200 box is shown at 1600 × 900.
            const video = Object.assign(fakeMedia({ width: 1600, height: 1200 }), {
                videoWidth: 1920,
                videoHeight: 1080,
            });
            const { zm } = makeManager({ media: { single: video } });
            zm.setZoom('single', 2, 0, 0);
            zm.handlePanStart({ clientX: 0, clientY: 0 }, 'single');
            zm.handlePanMove({ clientX: 0, clientY: 5000 });
            expect(zm.state.single.translateY).toBe(450); // 900 × (2 − 1) / 2, not the box's 600
        });

        it('media with no natural size (a canvas, a video before its metadata) keeps the box', () => {
            const { zm } = makeManager({ media: { single: fakeMedia({ width: 400, height: 200 }) } });
            zm.setZoom('single', 2, 0, 0);
            zm.handlePanStart({ clientX: 0, clientY: 0 }, 'single');
            zm.handlePanMove({ clientX: 5000, clientY: 0 });
            expect(zm.state.single.translateX).toBe(200);
        });
    });

    // PR #90 review #3: at the cap, each further notch slid the image until a notch missed it and changed the file.
    it('a wheel past the 8× cap leaves the scale and the position alone', () => {
        const { zm } = makeManager();
        zm.setZoom('single', 8, 0, 0);
        const e = wheel(-100);
        e.clientX = 150; // 50 px right of centre
        zm.handleWheel(e, 'single');
        expect(zm.state.single).toEqual({ scale: 8, translateX: 0, translateY: 0 });
        expect(e.preventDefault).toHaveBeenCalledTimes(1);
        expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    });

    // PR #90 review #4: 1.15 and its rounded reciprocal drift, so a round trip of 4+ notches ended at
    // 1.0000000000000002, which read 100% while isZoomed() said true (a click no longer left fullscreen).
    it('the same number of steps in and out lands exactly on 100%, by wheel or by the popover', () => {
        const { zm } = makeManager();
        for (const n of [4, 5, 10, 14]) {
            zm.reset('single');
            for (let i = 0; i < n; i++) {
                zm.handleWheel({ ...wheel(-100), clientX: 150 }, 'single');
            }
            for (let i = 0; i < n; i++) {
                zm.handleWheel({ ...wheel(100), clientX: 150 }, 'single');
            }
            expect(zm.state.single).toEqual({ scale: 1, translateX: 0, translateY: 0 });
            expect(zm.isZoomed()).toBe(false);
        }

        zm.createPopover('single', fakeEl('div'), fakeEl('button'));
        const { zoomInBtn, zoomOutBtn } = zm.popovers.single;
        for (let i = 0; i < 10; i++) {
            zoomInBtn.listeners.click[0]({ stopPropagation: vi.fn() });
        }
        for (let i = 0; i < 10; i++) {
            zoomOutBtn.listeners.click[0]({ stopPropagation: vi.fn() });
        }
        expect(zm.state.single.scale).toBe(1);
        expect(zm.isZoomed()).toBe(false);
    });

    // PR #90 review #7: a horizontal wheel or a sideways touchpad swipe (deltaY 0) zoomed in 15% per event.
    it('a wheel with deltaY 0 does not zoom, and is still kept from the document handler', () => {
        const { zm } = makeManager();
        const e = wheel(0);
        zm.handleWheel(e, 'single');
        expect(zm.state.single.scale).toBe(1);
        expect(e.preventDefault).toHaveBeenCalledTimes(1);
        expect(e.stopPropagation).toHaveBeenCalledTimes(1);
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

    // Spec § 3.3 invariants 3, 4 and 6, which no test could fail for before PR #90 review #11.
    describe('invariants the move must keep (spec § 3.3)', () => {
        it('a click or mousedown inside a popover stops there, so the document click cannot close it', () => {
            const { zm } = makeManager();
            zm.createPopover('single', fakeEl('div'), fakeEl('button'));
            const popover = zm.popovers.single.container;
            for (const type of ['click', 'mousedown']) {
                const e = { stopPropagation: vi.fn() };
                popover.listeners[type][0](e);
                expect(e.stopPropagation, type).toHaveBeenCalledTimes(1);
            }
        });

        it("'+' zooms in and '−' zooms out by 1.15 about the media centre", () => {
            const { zm } = makeManager();
            zm.createPopover('single', fakeEl('div'), fakeEl('button'));
            const click = (btn) => zm.popovers.single[btn].listeners.click[0]({ stopPropagation: vi.fn() });
            click('zoomInBtn');
            click('zoomInBtn');
            expect(zm.state.single.scale).toBeCloseTo(1.3225, 10);
            click('zoomOutBtn');
            expect(zm.state.single.scale).toBeCloseTo(1.15, 10);
            expect(zm.state.single.translateX).toBeCloseTo(0, 10);
        });

        it('a double-click inside fullscreen leaves the zoom alone; outside it steps', () => {
            const { zm } = makeManager();
            const el = fakeMedia();
            let inFullscreen = true;
            el.closest = (selector) => (selector === '.fullscreen' && inFullscreen ? {} : null);
            zm.attachToMedia(el, 'single');
            const e = { clientX: 100, clientY: 50, preventDefault: vi.fn(), stopPropagation: vi.fn() };
            el.listeners.dblclick.fn(e);
            expect(zm.state.single.scale).toBe(1);
            expect(e.preventDefault).not.toHaveBeenCalled();
            inFullscreen = false;
            el.listeners.dblclick.fn(e);
            expect(zm.state.single.scale).toBe(2);
        });

        it('only the left button starts a pan', () => {
            const { zm } = makeManager();
            const el = fakeMedia();
            zm.attachToMedia(el, 'single');
            zm.setZoom('single', 2, 0, 0);
            const right = { button: 2, clientX: 0, clientY: 0, preventDefault: vi.fn() };
            el.listeners.mousedown.fn(right);
            expect(zm.isPanning).toBe(false);
            expect(right.preventDefault).not.toHaveBeenCalled();
            const left = { ...right, button: 0, preventDefault: vi.fn() };
            el.listeners.mousedown.fn(left);
            expect(zm.isPanning).toBe(true);
            expect(left.preventDefault).toHaveBeenCalledTimes(1);
        });
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

// One copy of the zoom code: the renderer delegates to this.zoom and defines none of the old methods or state.
it('media-viewer.js keeps no copy of the zoom code', () => {
    const src = readFileSync(new URL('../media-viewer.js', import.meta.url), 'utf8');
    const oldMethod =
        /^\s{4}(sliderToScale|scaleToSlider|setupZoomPopovers|createZoomPopover|removeZoomPopover|closeAllZoomPopovers|getZoomTarget|getMediaElement|setZoom|resetZoom|zoomAtPoint|cycleZoomStep|handleWheelZoom|handlePanStart|handlePanMove|handlePanEnd|updateZoomIndicator|isZoomed|setupZoomEvents)\(/m;
    expect(src.match(oldMethod)?.[0] ?? null).toBeNull();
    // Any member access too: a stale call such as this.resetZoom('single') on a line G3 never touched merges
    // cleanly and passes ESLint, then throws at runtime (PR #90 review #12).
    const oldMember =
        /\bthis\.(zoomState|zoomControlsMap|zoomSteps|minZoom|maxZoom|zoomFactor|isPanning|currentPanTarget|panStart|panStartTranslate|sliderToScale|scaleToSlider|setupZoomPopovers|createZoomPopover|removeZoomPopover|closeAllZoomPopovers|getZoomTarget|getMediaElement|setZoom|resetZoom|zoomAtPoint|cycleZoomStep|handleWheelZoom|handlePanStart|handlePanMove|handlePanEnd|updateZoomIndicator|isZoomed|setupZoomEvents)\b/;
    expect(src.match(oldMember)?.[0] ?? null).toBeNull();
});
