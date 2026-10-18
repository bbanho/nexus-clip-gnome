import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

export default class extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        const apiGroup = new Adw.PreferencesGroup({
            title: 'API',
        });
        page.add(apiGroup);

        const endpointRow = new Adw.EntryRow({
            title: 'api-endpoint',
            text: settings.get_string('api-endpoint'),
        });
        apiGroup.add(endpointRow);
        endpointRow.connect('notify::text', (entry) => {
            settings.set_string('api-endpoint', entry.get_text());
        });

        const modelRow = new Adw.EntryRow({
            title: 'model-name',
            text: settings.get_string('model-name'),
        });
        apiGroup.add(modelRow);
        modelRow.connect('notify::text', (entry) => {
            settings.set_string('model-name', entry.get_text());
        });

        const apiKeyRow = new Adw.PasswordEntryRow({
            title: 'api-key',
            text: settings.get_string('api-key'),
        });
        apiGroup.add(apiKeyRow);
        apiKeyRow.connect('notify::text', (entry) => {
            settings.set_string('api-key', entry.get_text());
        });

        const streamRow = new Adw.SwitchRow({
            title: 'stream',
        });
        settings.bind('stream', streamRow, 'active', 0);
        apiGroup.add(streamRow);

        const presetsGroup = new Adw.PreferencesGroup({
            title: 'Presets',
        });
        page.add(presetsGroup);

        const presetsExpander = new Adw.ExpanderRow({
            title: 'presets',
        });
        presetsGroup.add(presetsExpander);

        const buffer = new Gtk.TextBuffer();
        buffer.set_text(settings.get_string('presets'), -1);
        buffer.connect('changed', () => {
            const [start, end] = buffer.get_bounds();
            const text = buffer.get_text(start, end, false);
            settings.set_string('presets', text);
        });

        const textView = new Gtk.TextView({
            buffer: buffer,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            vexpand: true,
            hexpand: true,
            height_request: 120,
        });

        const scrolledWindow = new Gtk.ScrolledWindow({
            child: textView,
            has_frame: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
        presetsExpander.add_row(scrolledWindow);

        const hotkeyGroup = new Adw.PreferencesGroup({
            title: 'Atalhos',
        });
        page.add(hotkeyGroup);

        hotkeyGroup.add(this._createHotkeyRow('hotkey-push', 'hotkey-push', settings));
        hotkeyGroup.add(this._createHotkeyRow('hotkey-choose', 'hotkey-choose', settings));
        hotkeyGroup.add(this._createHotkeyRow('hotkey-loop', 'hotkey-loop', settings));
    }

    _createHotkeyRow(title, settingsKey, settings) {
        const row = new Adw.ActionRow({ title: title });

        const entry = new Gtk.Entry({
            text: settings.get_strv(settingsKey)[0] || '',
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        entry.connect('changed', () => {
            const [key, mods] = Gtk.accelerator_parse(entry.get_text());
            if (Gtk.accelerator_valid(key, mods)) {
                entry.remove_css_class('error');
                settings.set_strv(settingsKey, [entry.get_text()]);
            } else {
                entry.add_css_class('error');
            }
        });

        row.add_suffix(entry);
        row.set_activatable_widget(entry);
        return row;
    }
}
