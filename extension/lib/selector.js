import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

const registry = new Set();

export function openSelector({ presets, onChoose, withResponse = false }) {
    if (!presets || typeof presets !== 'object') {
        presets = {};
    }

    const win = new Gtk.Window({
        title: 'Nexus Clip — escolher prompt',
        default_width: 400,
        default_height: 300,
        modal: false,
    });

    registry.add(win);

    const mainBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
    });
    win.set_child(mainBox);

    const header = new Gtk.Label({
        label: 'Selecione um prompt',
        xalign: 0,
        margin_bottom: 6,
    });
    mainBox.append(header);

    const scrolledList = new Gtk.ScrolledWindow({
        has_frame: true,
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vexpand: true,
    });
    mainBox.append(scrolledList);

    const listBox = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.SINGLE,
    });
    scrolledList.set_child(listBox);

    const presetNames = Object.keys(presets);
    for (let i = 0; i < presetNames.length; i++) {
        const name = presetNames[i];
        const row = new Gtk.ListBoxRow();
        const rowBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });
        const label = new Gtk.Label({
            label: name,
            xalign: 0,
            hexpand: true,
        });
        rowBox.append(label);
        row.set_child(rowBox);
        row._presetName = name;
        row._presetText = presets[name];
        listBox.append(row);
    }

    let responseBuffer = null;
    let responseTextView = null;
    let responseScrolled = null;

    if (withResponse === true) {
        responseBuffer = new Gtk.TextBuffer();
        responseTextView = new Gtk.TextView({
            buffer: responseBuffer,
            editable: false,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            monospace: true,
            vexpand: true,
            hexpand: true,
            height_request: 120,
        });
        responseScrolled = new Gtk.ScrolledWindow({
            child: responseTextView,
            has_frame: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
        mainBox.append(responseScrolled);
    }

    const cancelButton = new Gtk.Button({
        label: 'Cancelar',
        margin_top: 6,
    });
    mainBox.append(cancelButton);

    listBox.connect('row-activated', (box, row) => {
        if (typeof onChoose === 'function') {
            const name = row._presetName;
            const text = row._presetText;
            onChoose(name, text);
        }
        win.close();
    });

    cancelButton.connect('clicked', () => {
        win.close();
    });

    win.connect('close-request', () => {
        registry.delete(win);
        return false;
    });

    const api = {
        window: win,
        setResponse: function (text) {
            if (!responseBuffer) {
                return;
            }
            if (typeof text !== 'string') {
                text = String(text);
            }
            responseBuffer.set_text(text, -1);
        },
        appendResponse: function (delta) {
            if (!responseBuffer) {
                return;
            }
            if (typeof delta !== 'string') {
                delta = String(delta);
            }
            const end = responseBuffer.get_end_iter();
            responseBuffer.insert(end, delta, -1);
        },
        close: function () {
            win.close();
        },
    };

    win.present();

    return api;
}
