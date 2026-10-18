import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { createActions } from './lib/actions.js';

export default class NexusClipExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._actions = createActions({ settings: this._settings });

        Main.wm.addKeybinding(
            'hotkey-push',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            () => {
                this._actions.s1PushProcess();
            }
        );

        Main.wm.addKeybinding(
            'hotkey-choose',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            () => {
                this._actions.s2Choose();
            }
        );

        Main.wm.addKeybinding(
            'hotkey-loop',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            () => {
                this._actions.s3Loop();
            }
        );
    }

    disable() {
        Main.wm.removeKeybinding('hotkey-push');
        Main.wm.removeKeybinding('hotkey-choose');
        Main.wm.removeKeybinding('hotkey-loop');

        this._settings = null;
        this._actions = null;
    }
}