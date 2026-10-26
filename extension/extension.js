import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import { createActions } from './lib/actions.js';
import { loadShortcuts, shortcutsSignature } from './lib/config.js';
import { MAX_SHORTCUTS, registrationList } from './lib/shortcuts.js';

const SLOT_PREFIX = 'hotkey-slot-';

export default class NexusClipExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._actions = createActions({ settings: this._settings });
        this._activeSlots = [];
        this._signature = '';

        this._settings.connectObject(
            'changed::shortcuts',
            () => this._syncShortcuts(),
            this
        );

        this._syncShortcuts();
    }

    disable() {
        this._settings?.disconnectObject(this);
        this._removeBindings();
        this._actions?.destroy();
        this._actions = null;
        this._settings = null;
    }

    _syncShortcuts() {
        if (!this._settings)
            return;

        const shortcuts = loadShortcuts(this._settings);
        const signature = shortcutsSignature(shortcuts);

        // Prompt/label edits do not need a re-grab: the handler resolves the
        // shortcut by id from the current settings on every keypress.
        if (signature === this._signature)
            return;
        this._signature = signature;

        this._removeBindings();
        this._addBindings(registrationList(shortcuts));
    }

    _removeBindings() {
        for (const name of this._activeSlots) {
            try {
                Main.wm.removeKeybinding(name);
            } catch (error) {
                logError(error, `nexus-clip: removeKeybinding(${name})`);
            }
        }
        this._activeSlots = [];
    }

    _addBindings(shortcuts) {
        shortcuts.forEach((shortcut, index) => {
            const name = `${SLOT_PREFIX}${index}`;
            const current = this._settings.get_strv(name);
            if (current.length !== 1 || current[0] !== shortcut.accel)
                this._settings.set_strv(name, [shortcut.accel]);

            try {
                Main.wm.addKeybinding(
                    name,
                    this._settings,
                    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                    Shell.ActionMode.NORMAL |
                        Shell.ActionMode.OVERVIEW |
                        Shell.ActionMode.POPUP,
                    () => this._actions?.runById(shortcut.id)
                );
                this._activeSlots.push(name);
            } catch (error) {
                logError(
                    error,
                    `nexus-clip: addKeybinding(${shortcut.accel}) — conflito?`
                );
                Main.notify(
                    'Nexus Clip',
                    `Não foi possível registrar ${shortcut.accel} (conflito?)`
                );
            }
        });

        // Clear stale slots left by a longer previous list.
        for (let index = shortcuts.length; index < MAX_SHORTCUTS; index++) {
            const name = `${SLOT_PREFIX}${index}`;
            if (this._settings.get_strv(name).length > 0)
                this._settings.set_strv(name, []);
        }
    }
}
