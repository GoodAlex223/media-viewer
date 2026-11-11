// The Modules section of the F1 overlay (v2 P1a; spec § 10, plan C4, C10). One row per module main found: its name,
// what it is, whether it is on, and why not. A toggle is saved through main at once and takes effect on restart, so
// the section shows "Restart now" while the next launch would differ from this one. Restart runs the app's own close
// flow (MediaViewer.handleAppCloseRequest({ restart: true })). Built with createElement and textContent only.

const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');

function statusOf(row, outcome) {
    if (row.status === 'invalid') {
        return `Not valid: ${row.reason}`;
    }
    if (row.status === 'off') {
        return 'Off';
    }
    if (row.status === 'blocked') {
        return capitalize(row.reason);
    }
    if (!outcome) {
        return 'Not started';
    }
    if (outcome.state === 'failed') {
        return `Failed: ${outcome.reason}`;
    }
    if (outcome.state === 'blocked') {
        return capitalize(outcome.reason);
    }
    return 'On';
}

/**
 * What each row says, from main's list and the host's outcomes.
 * @param {{ restartNeeded: boolean, modules: Array<object> } | null} list
 * @param {(id: string) => ({ state: string, reason: string | null } | null)} outcomeOf
 */
export function describeModuleRows(list, outcomeOf) {
    const modules = list && Array.isArray(list.modules) ? list.modules : [];
    if (modules.length === 0) {
        return { empty: true, restartNeeded: false, rows: [] };
    }
    return {
        empty: false,
        restartNeeded: Boolean(list.restartNeeded),
        rows: modules.map((row) => {
            const pending = row.enabledNext !== row.enabledAtLaunch ? ' — restart to apply' : '';
            return {
                id: row.id,
                name: row.name,
                version: row.version,
                description: row.description,
                checked: Boolean(row.enabledNext),
                toggleDisabled: row.status === 'invalid',
                status: statusOf(row, outcomeOf(row.id)) + pending,
            };
        }),
    };
}

export class ModulesPanel {
    /**
     * @param {object} deps
     * @param {HTMLElement | null} deps.root #modulesSection
     * @param {{ setModuleEnabled: (id: string, enabled: boolean) => Promise<any> }} deps.api
     * @param {(message: string, type?: string) => void} deps.notify
     * @param {() => object | null} deps.getList the host's list, as fetched at start
     * @param {(id: string) => object | null} deps.outcomeOf
     * @param {() => void} deps.requestRestart
     */
    constructor({ root, api, notify, getList, outcomeOf, requestRestart }) {
        this.root = root;
        this.api = api;
        this.notify = notify;
        this.getList = getList;
        this.outcomeOf = outcomeOf;
        this._list = null; // main's newest list, once a toggle returned one
        this.root?.querySelector('#modulesRestartBtn')?.addEventListener('click', () => requestRestart());
    }

    render() {
        if (!this.root) {
            return;
        }
        const model = describeModuleRows(this._list ?? this.getList(), this.outcomeOf);
        const listEl = this.root.querySelector('#modulesList');
        const bar = this.root.querySelector('#modulesRestartBar');
        if (bar) {
            bar.hidden = !model.restartNeeded;
        }
        if (!listEl) {
            return;
        }
        if (model.empty) {
            const empty = document.createElement('p');
            empty.className = 'modules-empty';
            empty.textContent = 'No modules yet';
            listEl.replaceChildren(empty);
            return;
        }
        listEl.replaceChildren(...model.rows.map((r) => this._row(r)));
    }

    _row(r) {
        const label = document.createElement('label');
        label.className = 'module-row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = r.checked;
        box.disabled = r.toggleDisabled;
        box.addEventListener('change', () => this._toggle(r.id, box));
        const text = document.createElement('div');
        text.className = 'module-row-text';
        const name = document.createElement('span');
        name.className = 'module-row-name';
        name.textContent = r.version ? `${r.name} ${r.version}` : r.name;
        text.append(name);
        if (r.description) {
            const description = document.createElement('span');
            description.className = 'module-row-description';
            description.textContent = r.description;
            text.append(description);
        }
        const status = document.createElement('span');
        status.className = 'module-row-status';
        status.textContent = r.status;
        text.append(status);
        label.append(box, text);
        return label;
    }

    async _toggle(id, box) {
        const enabled = box.checked;
        box.disabled = true;
        let reply;
        try {
            reply = await this.api.setModuleEnabled(id, enabled);
        } catch (err) {
            reply = { error: err && err.message ? err.message : String(err) };
        }
        if (!reply || reply.error || !Array.isArray(reply.modules)) {
            box.checked = !enabled;
            box.disabled = false;
            this.notify(`Could not save the module setting: ${reply?.error ?? 'no reply'}`, 'error');
            return;
        }
        this._list = reply;
        this.render();
    }
}
