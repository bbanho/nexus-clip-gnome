import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

export default class NexusClipExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        Main.wm.addKeybinding(
            'hotkey-push',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL,
            () => {
                console.debug('[nexus-clip] hotkey-push pressed');
                Main.notify('Nexus Clip', 'hotkey-push OK');
            }
        );
    }

    disable() {
        Main.wm.removeKeybinding('hotkey-push');

        this._settings = null;
    }
}
