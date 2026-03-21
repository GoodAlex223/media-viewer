/**
 * FullscreenManager — manages fullscreen enter/exit for media wrappers.
 *
 * Extracted from MediaViewer as the first v2.0 modularization step.
 * Pattern: stateful manager with constructor-injected callbacks for
 * host (MediaViewer) dependencies.
 */
export class FullscreenManager {
    /**
     * @param {Object} options
     * @param {(wrapper: HTMLElement) => boolean} options.isZoomed
     *   Returns true if the wrapper's media is zoomed (scale > 1).
     *   Used by click-to-exit handler to prevent exiting while zoomed.
     * @param {(wrapper: HTMLElement) => void} options.pauseOtherVideos
     *   Pauses video elements in other wrappers when entering fullscreen.
     *   Compare mode behavior — pauses the non-fullscreened pane's video.
     */
    constructor({ isZoomed, pauseOtherVideos }) {
        this.abortControllers = new Map(); // Map<HTMLElement, AbortController>
        this.isZoomed = isZoomed;
        this.pauseOtherVideos = pauseOtherVideos;
    }

    /**
     * Toggle fullscreen on a media wrapper element.
     * If already fullscreen, exits. Otherwise enters fullscreen.
     * @param {HTMLElement} wrapper - The .media-wrapper element
     */
    toggle(wrapper) {
        if (wrapper.classList.contains('fullscreen')) {
            this.cleanup(wrapper);
        } else {
            // Get the video element in this wrapper
            const video = wrapper.querySelector('video');
            const wasPlaying = video && !video.paused;

            // Store playback state on wrapper
            wrapper.dataset.wasPlaying = wasPlaying;

            // Pause other videos in compare mode
            this.pauseOtherVideos(wrapper);

            wrapper.classList.add('fullscreen');

            // Add indicator
            const indicator = document.createElement('div');
            indicator.className = 'fullscreen-indicator';
            indicator.textContent = 'Press ESC to exit fullscreen';
            wrapper.appendChild(indicator);

            // Resume video playback if it was playing
            if (video && wasPlaying) {
                // Small delay to ensure fullscreen transition completes
                setTimeout(() => {
                    video.play().catch((err) => console.log('Auto-play prevented:', err));
                }, 100);
            }

            // Click to exit (but not on overlay buttons or when zoomed)
            // Use AbortController so cleanup() can remove this listener
            // regardless of which exit path is taken (click, ESC, Z/X keys)
            const existing = this.abortControllers.get(wrapper);
            if (existing) existing.abort();
            const abortController = new AbortController();
            this.abortControllers.set(wrapper, abortController);
            const exitHandler = (e) => {
                // Don't exit if clicking on overlay buttons (like/dislike/special)
                if (e.target.closest('.overlay-btn') || e.target.closest('.media-overlay-controls')) {
                    return;
                }
                // Don't exit if media is zoomed (use ESC to exit when zoomed)
                if (this.isZoomed(wrapper)) {
                    return;
                }
                this.cleanup(wrapper);
            };
            wrapper.addEventListener('click', exitHandler, { signal: abortController.signal });
        }
    }

    /**
     * Exit fullscreen on a wrapper. Centralized cleanup — ALL exit paths route here.
     * No-op if wrapper is not in fullscreen (guards against double-calls).
     * @param {HTMLElement} wrapper - The .media-wrapper element
     */
    cleanup(wrapper) {
        if (!wrapper.classList.contains('fullscreen')) return;
        this.abortController(wrapper);

        wrapper.classList.remove('fullscreen');
        const indicator = wrapper.querySelector('.fullscreen-indicator');
        if (indicator) {
            indicator.remove();
        }

        // Restore video playback state if it was playing before fullscreen
        const video = wrapper.querySelector('video');
        if (video && wrapper.dataset.wasPlaying === 'true') {
            video.play().catch((err) => console.log('Auto-play prevented:', err));
        }
    }

    /**
     * Abort and delete the AbortController for a wrapper.
     * @param {HTMLElement} wrapper - The .media-wrapper element
     */
    abortController(wrapper) {
        const ctrl = this.abortControllers.get(wrapper);
        if (ctrl) {
            ctrl.abort();
            this.abortControllers.delete(wrapper);
        }
    }
}
