// The notification system (bottom-right toasts), moved out of media-viewer.js in v2 P1a (plan C3). The body is
// MediaViewer.showNotification's, unchanged, which now delegates here; host.ui.notify wraps it for modules.
//
// show() returns the notification element. `options.sticky` (G2 PR 1, the similarity offer): the notification stays
// until closed by × or by its owner, is neither counted nor removed by the two prunes below, and its action button
// leaves the closing to the caller.
export class Notifier {
    /**
     * @param {object} deps
     * @param {HTMLElement} deps.container #notificationContainer
     * @param {() => boolean} deps.autoCloseErrors read at each show: the Settings toggle can change it
     */
    constructor({ container, autoCloseErrors }) {
        this.container = container;
        this.autoCloseErrors = autoCloseErrors;
    }

    show(message, type = 'success', options = {}) {
        const sticky = options.sticky === true;
        // Limit total notifications to 5, remove oldest when exceeded
        const allNotifications = Array.from(this.container.querySelectorAll('.notification:not(.sticky)'));
        while (allNotifications.length >= 5) {
            allNotifications.shift().remove();
        }

        // Limit info notifications to prevent UI freezing
        if (type === 'info') {
            // Remove old info notifications if more than 2 exist
            const infoNotifications = Array.from(this.container.querySelectorAll('.notification.info:not(.sticky)'));
            if (infoNotifications.length >= 2) {
                // Remove oldest info notifications
                infoNotifications.slice(0, infoNotifications.length - 1).forEach((n) => n.remove());
            }
        }

        const notification = document.createElement('div');
        notification.className = sticky ? `notification ${type} sticky` : `notification ${type}`;

        // Create message text container
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        messageSpan.style.cursor = 'pointer';
        messageSpan.title = 'Click to copy';
        messageSpan.style.flex = '1';

        // Create action button if provided
        let actionBtn = null;
        if (options.actionButton && options.actionCallback) {
            actionBtn = document.createElement('button');
            actionBtn.textContent = options.actionButton;
            actionBtn.className = 'notification-action';
            actionBtn.title = options.actionButton;
        }

        // Create close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.className = 'notification-close';
        closeBtn.title = 'Close';

        notification.appendChild(messageSpan);
        if (actionBtn) {
            notification.appendChild(actionBtn);
        }
        notification.appendChild(closeBtn);

        // Add click handler to copy message
        messageSpan.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(message);
                const originalText = messageSpan.textContent;
                messageSpan.textContent = '✓ Copied!';
                setTimeout(() => {
                    if (notification.parentNode) {
                        messageSpan.textContent = originalText;
                    }
                }, 1000);
            } catch (error) {
                console.error('Failed to copy:', error);
            }
        });

        // Add close button handler
        const closeNotification = () => {
            notification.style.animation = 'slideOutDown 0.3s ease-in forwards';
            setTimeout(() => notification.remove(), 300);
        };
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeNotification();
        });

        // Add action button handler
        if (actionBtn) {
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                options.actionCallback();
                if (!sticky) {
                    closeNotification();
                }
            });
        }

        this.container.appendChild(notification);

        // Auto-close: info/success - 2s, warning - 5s, error - 8s if enabled or keep visible
        const displayTime = type === 'error' ? (this.autoCloseErrors() ? 8000 : 0) : type === 'warning' ? 5000 : 2000;
        if (displayTime > 0 && !sticky) {
            const autoCloseTimeout = setTimeout(closeNotification, displayTime);
            closeBtn.addEventListener('click', () => clearTimeout(autoCloseTimeout), { once: true });
        }
        return notification;
    }
}
