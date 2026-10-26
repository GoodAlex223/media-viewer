/**
 * ZoomManager — zoom and pan for the single-mode media and the two compare/tournament sides.
 *
 * Extracted from MediaViewer as the third v2.0 modularization step (G3). Owns the zoom/pan state,
 * the zoom popovers, each media element's wheel/dblclick/pan listeners (attachToMedia) and its
 * three document listeners (init). Pattern: stateful manager with constructor-injected callbacks
 * for host (MediaViewer) dependencies, and no reference to MediaViewer.
 */
export class ZoomManager {
    /**
     * @param {Object} options
     * @param {(target: 'single'|'left'|'right') => HTMLElement|null} options.getMediaElement
     *   Returns the media element a target zooms: the left or right compare media, else the
     *   single-mode media.
     * @param {() => boolean} options.isCompareMode
     *   True while compare (or tournament) mode is on screen; isZoomed reads both sides then.
     * @param {(root: HTMLElement) => void} options.createIcons
     *   Renders the Lucide icons inside one popover (the host calls lucide.createIcons({ root })).
     */
    constructor({ getMediaElement, isCompareMode, createIcons }) {
        this.getMediaElement = getMediaElement;
        this.isCompareMode = isCompareMode;
        this.createIcons = createIcons;

        // Zoom state for each view
        this.state = {
            single: { scale: 1, translateX: 0, translateY: 0 },
            left: { scale: 1, translateX: 0, translateY: 0 },
            right: { scale: 1, translateX: 0, translateY: 0 },
        };
        this.zoomSteps = [1, 2, 4]; // Click-to-zoom levels
        this.minZoom = 1;
        this.maxZoom = 8;
        this.zoomFactor = 1.15; // Wheel zoom factor per tick
        this.isPanning = false;
        this.currentPanTarget = null;
        this.panStart = { x: 0, y: 0 };
        this.panStartTranslate = { x: 0, y: 0 };

        // Popover entries by target: { container, slider, zoomInBtn, zoomOutBtn, valueDisplay, toggleBtn,
        // isSliderDragging, abortController }
        this.popovers = {};
    }

    init() {
        // Only the single-mode zoom is static markup; compare-mode buttons come from addMediaOverlayControls.
        const wrapper = document.getElementById('zoomBtnWrapper');
        const toggleBtn = document.getElementById('zoomToggleBtn');
        if (wrapper && toggleBtn) {
            this.createPopover('single', wrapper, toggleBtn);
        }
        // Close popovers on outside click
        document.addEventListener('click', () => this.hideAllPopovers());
        // Pan: a drag that leaves the media keeps panning until the button is released anywhere
        document.addEventListener('mousemove', (e) => this.handlePanMove(e));
        document.addEventListener('mouseup', () => this.handlePanEnd());
    }

    // Logarithmic mapping for zoom slider: 0-100 → scale 1-8
    sliderToScale(value) {
        const normalized = value / 100;
        return Math.exp(Math.log(this.minZoom) + normalized * (Math.log(this.maxZoom) - Math.log(this.minZoom)));
    }

    scaleToSlider(scale) {
        const clamped = Math.max(this.minZoom, Math.min(this.maxZoom, scale));
        return ((Math.log(clamped) - Math.log(this.minZoom)) / (Math.log(this.maxZoom) - Math.log(this.minZoom))) * 100;
    }

    // Builds a fresh popover for target. The caller removes the previous one first (removePopover), as
    // addMediaOverlayControls does: a second call for the same target would leave the old popover and listeners.
    createPopover(target, wrapper, toggleBtn) {
        // Build popover DOM: [-] [slider] [+] [100%]
        const popover = document.createElement('div');
        popover.className = 'zoom-popover';

        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.className = 'zoom-pop-btn';
        zoomOutBtn.title = 'Zoom out';
        zoomOutBtn.innerHTML = '<i data-lucide="minus"></i>';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'zoom-slider';
        slider.min = '0';
        slider.max = '100';
        slider.value = '0';
        slider.step = '1';
        slider.title = 'Zoom level';

        const zoomInBtn = document.createElement('button');
        zoomInBtn.className = 'zoom-pop-btn';
        zoomInBtn.title = 'Zoom in';
        zoomInBtn.innerHTML = '<i data-lucide="plus"></i>';

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'zoom-value';
        valueDisplay.textContent = '100%';

        popover.appendChild(zoomOutBtn);
        popover.appendChild(slider);
        popover.appendChild(zoomInBtn);
        popover.appendChild(valueDisplay);

        wrapper.appendChild(popover);

        // Store references
        const zoomAbort = new AbortController();
        this.popovers[target] = {
            container: popover,
            slider,
            zoomInBtn,
            zoomOutBtn,
            valueDisplay,
            toggleBtn,
            isSliderDragging: false,
            abortController: zoomAbort,
        };

        // Toggle popover on button click
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = popover.classList.contains('show');
            this.hideAllPopovers();
            if (!isOpen) popover.classList.add('show');
        });

        // Zoom center helper
        const zoomCenter = () => {
            const element = this.getMediaElement(target);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        };

        zoomInBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const state = this.state[target];
            const newScale = Math.min(this.maxZoom, state.scale * this.zoomFactor);
            const center = zoomCenter();
            if (center) this.zoomAtPoint(target, newScale, center.x, center.y);
        });

        zoomOutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const state = this.state[target];
            const newScale = Math.max(this.minZoom, state.scale / this.zoomFactor);
            if (newScale <= this.minZoom) {
                this.reset(target);
            } else {
                const center = zoomCenter();
                if (center) this.zoomAtPoint(target, newScale, center.x, center.y);
            }
        });

        slider.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.popovers[target].isSliderDragging = true;
        });
        slider.addEventListener('input', (e) => {
            const newScale = this.sliderToScale(parseFloat(e.target.value));
            if (newScale <= this.minZoom + 0.01) {
                this.reset(target);
            } else {
                const center = zoomCenter();
                if (center) this.zoomAtPoint(target, newScale, center.x, center.y);
            }
        });
        document.addEventListener(
            'mouseup',
            () => {
                if (this.popovers[target]) {
                    this.popovers[target].isSliderDragging = false;
                }
            },
            { signal: zoomAbort.signal }
        );

        // Prevent popover clicks from closing via document handler
        popover.addEventListener('mousedown', (e) => e.stopPropagation());
        popover.addEventListener('click', (e) => e.stopPropagation());

        // Initialize Lucide icons (the host's callback scopes them to this popover: { root })
        this.createIcons(popover);
    }

    // Dismiss a zoom popover and drop its listeners. Deliberately does NOT remove the toggle
    // button: the button belongs to whoever built it (addMediaOverlayControls rebuilds the whole
    // group, single mode's #zoomBtnWrapper is static markup). Removing it here used to delete
    // the zoom control from every tournament pair after the first — showTournamentPairFast calls
    // cleanupCompareMedia, which calls this, and (before this fix) never rebuilt the group (G2).
    // showTournamentPairFast now rebuilds both groups itself right after the cleanup phase (see
    // its own comment in media-viewer.js) — this method stays a pure "dismiss the popover" op either way.
    removePopover(target) {
        const entry = this.popovers[target];
        if (!entry) return;
        if (entry.abortController) entry.abortController.abort();
        if (entry.container.parentNode) entry.container.remove();
        delete this.popovers[target];
    }

    // Hides every popover and keeps its entry (removePopover is the one that forgets).
    hideAllPopovers() {
        for (const entry of Object.values(this.popovers)) {
            entry.container.classList.remove('show');
        }
    }

    setZoom(target, scale, translateX, translateY) {
        const state = this.state[target];
        if (!state) return;

        // A scale within float noise of minZoom (100%) snaps to it, centred: 1.15 and its rounded reciprocal
        // drift, so 4+ wheel notches (or '+' presses) in and out ended at 1.0000000000000002, which read 100%
        // while isZoomed() still said true (PR #90 review #4).
        const clamped = Math.max(this.minZoom, Math.min(this.maxZoom, scale));
        const atRest = Math.abs(clamped - this.minZoom) < 1e-9;
        state.scale = atRest ? this.minZoom : clamped;
        state.translateX = atRest ? 0 : translateX;
        state.translateY = atRest ? 0 : translateY;

        const element = this.getMediaElement(target);
        if (element) {
            element.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
            element.style.cursor = state.scale > 1 ? 'grab' : 'default';
        }

        this.updateIndicator(target);
    }

    reset(target) {
        if (target === 'all') {
            this.reset('single');
            this.reset('left');
            this.reset('right');
            return;
        }

        this.setZoom(target, 1, 0, 0);
    }

    zoomAtPoint(target, newScale, clientX, clientY) {
        const element = this.getMediaElement(target);
        if (!element) return;

        const state = this.state[target];
        const rect = element.getBoundingClientRect();

        // Calculate cursor position relative to element center
        const elementCenterX = rect.left + rect.width / 2;
        const elementCenterY = rect.top + rect.height / 2;

        // Cursor offset from center in screen coordinates
        const offsetX = clientX - elementCenterX;
        const offsetY = clientY - elementCenterY;

        // Calculate new translate to keep point under cursor
        const scaleRatio = newScale / state.scale;

        let newTranslateX = state.translateX - offsetX * (scaleRatio - 1);
        let newTranslateY = state.translateY - offsetY * (scaleRatio - 1);

        // Constrain pan to reasonable bounds when zoomed, by the picture's unscaled size (pictureSize): the rect
        // above already includes this element's own scale, which made the bound s times too loose (PR #90 review #2).
        if (newScale > 1) {
            const picture = this.pictureSize(element);
            const maxTranslateX = (picture.width * (newScale - 1)) / 2;
            const maxTranslateY = (picture.height * (newScale - 1)) / 2;
            newTranslateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, newTranslateX));
            newTranslateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, newTranslateY));
        } else {
            newTranslateX = 0;
            newTranslateY = 0;
        }

        this.setZoom(target, newScale, newTranslateX, newTranslateY);
    }

    cycleStep(target, clientX, clientY) {
        const state = this.state[target];
        const currentScale = state.scale;

        // Find next zoom step
        let nextStep = this.zoomSteps[0];
        for (let i = 0; i < this.zoomSteps.length; i++) {
            if (currentScale < this.zoomSteps[i]) {
                nextStep = this.zoomSteps[i];
                break;
            }
            // If we're at or beyond the last step, reset to 1
            if (i === this.zoomSteps.length - 1) {
                nextStep = this.zoomSteps[0];
            }
        }

        if (nextStep === 1) {
            this.reset(target);
        } else {
            this.zoomAtPoint(target, nextStep, clientX, clientY);
        }
    }

    handleWheel(e, target) {
        e.preventDefault();
        e.stopPropagation();

        // A horizontal wheel or a sideways touchpad swipe has no vertical step to zoom by (PR #90 review #7)
        if (e.deltaY === 0) return;

        const state = this.state[target];
        const delta = e.deltaY > 0 ? -1 : 1;
        // Clamped before zoomAtPoint: at a cap the unclamped ratio kept sliding the image while the scale
        // stayed put, until a notch missed the image and the document handler changed the file (PR #90 review #3)
        const newScale = Math.max(this.minZoom, Math.min(this.maxZoom, state.scale * Math.pow(this.zoomFactor, delta)));
        if (newScale === state.scale) return;

        this.zoomAtPoint(target, newScale, e.clientX, e.clientY);
    }

    handlePanStart(e, target) {
        const state = this.state[target];
        if (state.scale <= 1) return false;

        this.isPanning = true;
        this.currentPanTarget = target;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.panStartTranslate = { x: state.translateX, y: state.translateY };

        const element = this.getMediaElement(target);
        if (element) {
            element.style.cursor = 'grabbing';
        }

        return true;
    }

    // The unscaled size of the picture an element shows, which is what the pan bounds keep on screen. Usually that is
    // the layout box (offsetWidth/offsetHeight; no transform changes it). But object-fit: contain can letterbox the
    // media inside a larger box: fitMediaToScreen gives media larger than the window a 100vw × 100vh box (PR #90
    // review round 2). natural size × the contain fit covers both, since it equals the box when the box already
    // has the picture's shape. A canvas, or a video before its metadata, has no natural size and keeps the box.
    pictureSize(element) {
        const boxWidth = element.offsetWidth;
        const boxHeight = element.offsetHeight;
        const naturalWidth = element.naturalWidth || element.videoWidth || 0;
        const naturalHeight = element.naturalHeight || element.videoHeight || 0;
        if (!naturalWidth || !naturalHeight) {
            return { width: boxWidth, height: boxHeight };
        }
        const fit = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
        return { width: naturalWidth * fit, height: naturalHeight * fit };
    }

    handlePanMove(e) {
        if (!this.isPanning) return;

        const target = this.currentPanTarget;
        const state = this.state[target];
        const element = this.getMediaElement(target);
        if (!element) return;

        const deltaX = e.clientX - this.panStart.x;
        const deltaY = e.clientY - this.panStart.y;

        let newTranslateX = this.panStartTranslate.x + deltaX;
        let newTranslateY = this.panStartTranslate.y + deltaY;

        // Constrain pan to image bounds: the picture's unscaled size (pictureSize), not getBoundingClientRect(),
        // which includes this element's own scale and let the image leave the pane (PR #90 review #2)
        const picture = this.pictureSize(element);
        const maxTranslateX = (picture.width * (state.scale - 1)) / 2;
        const maxTranslateY = (picture.height * (state.scale - 1)) / 2;

        newTranslateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, newTranslateX));
        newTranslateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, newTranslateY));

        this.setZoom(target, state.scale, newTranslateX, newTranslateY);
    }

    handlePanEnd() {
        if (!this.isPanning) return;

        const element = this.getMediaElement(this.currentPanTarget);
        if (element) {
            const state = this.state[this.currentPanTarget];
            element.style.cursor = state.scale > 1 ? 'grab' : 'default';
        }

        this.isPanning = false;
        this.currentPanTarget = null;
    }

    updateIndicator(target) {
        const entry = this.popovers[target];
        if (!entry) return;

        const state = this.state[target];

        // Sync slider and percentage display (skip during slider drag to avoid feedback loop)
        if (!entry.isSliderDragging) {
            entry.slider.value = this.scaleToSlider(state.scale);
        }
        entry.valueDisplay.textContent = `${Math.round(state.scale * 100)}%`;

        // Enable/disable buttons at boundaries
        entry.zoomOutBtn.disabled = state.scale <= this.minZoom;
        entry.zoomInBtn.disabled = state.scale >= this.maxZoom;

        // Toggle button active state when zoomed
        if (entry.toggleBtn) {
            if (state.scale > 1) {
                entry.toggleBtn.classList.add('active');
            } else {
                entry.toggleBtn.classList.remove('active');
            }
        }
    }

    isZoomed() {
        if (this.isCompareMode()) {
            return this.state.left.scale > 1 || this.state.right.scale > 1;
        }
        return this.state.single.scale > 1;
    }

    // FullscreenManager's isZoomed callback: a wrapper's side class picks the state it reads.
    isWrapperZoomed(wrapper) {
        const target = wrapper.classList.contains('left-media-wrapper')
            ? 'left'
            : wrapper.classList.contains('right-media-wrapper')
              ? 'right'
              : 'single';
        return this.state[target] && this.state[target].scale > 1;
    }

    // Wires one media element; nothing is detached here. The host calls it once per element it builds, so
    // attaching the same element twice would double its listeners.
    attachToMedia(element, target) {
        if (!element) return;

        // Helper to check if element is in fullscreen mode
        const isInFullscreen = () => element.closest('.fullscreen') !== null;

        // Double-click to cycle zoom (disabled in fullscreen - conflicts with click-to-exit)
        element.addEventListener('dblclick', (e) => {
            if (isInFullscreen()) return;
            e.preventDefault();
            e.stopPropagation();
            this.cycleStep(target, e.clientX, e.clientY);
        });

        // Wheel zoom (works in fullscreen)
        element.addEventListener(
            'wheel',
            (e) => {
                this.handleWheel(e, target);
            },
            { passive: false }
        );

        // Pan start (works in fullscreen when zoomed)
        element.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                // Left click only
                if (this.handlePanStart(e, target)) {
                    e.preventDefault();
                }
            }
        });
    }
}
