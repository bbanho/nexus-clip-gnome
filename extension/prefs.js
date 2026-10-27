import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';

import {
    MAX_SHORTCUTS,
    MODES,
    canonicalAccel,
    makeId,
    modeLabel,
    needsPrompt,
    validateShortcuts,
} from './lib/shortcuts.js';
import { loadShortcuts, readApiConfig, saveShortcuts } from './lib/config.js';
import * as store from './lib/store.js';
import { buildMessages } from './lib/v1core.js';
import { chat } from './lib/v1client.js';
import { middlePreview } from './lib/text-preview.js';

const MOD_MASK =
    Gdk.ModifierType.SHIFT_MASK |
    Gdk.ModifierType.CONTROL_MASK |
    Gdk.ModifierType.ALT_MASK |
    Gdk.ModifierType.SUPER_MASK |
    Gdk.ModifierType.HYPER_MASK |
    Gdk.ModifierType.META_MASK;

const MODIFIER_KEYS = new Set([
    Gdk.KEY_Shift_L,
    Gdk.KEY_Shift_R,
    Gdk.KEY_Control_L,
    Gdk.KEY_Control_R,
    Gdk.KEY_Alt_L,
    Gdk.KEY_Alt_R,
    Gdk.KEY_Super_L,
    Gdk.KEY_Super_R,
    Gdk.KEY_Meta_L,
    Gdk.KEY_Meta_R,
    Gdk.KEY_Hyper_L,
    Gdk.KEY_Hyper_R,
    Gdk.KEY_Caps_Lock,
    Gdk.KEY_Num_Lock,
    Gdk.KEY_ISO_Level3_Shift,
]);

function preview(text, length = 120) {
    const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
    return flat.length > length ? flat.slice(0, length - 1) + '…' : flat;
}

export default class NexusClipPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._window = window;
        this._settings = this.getSettings();
        this._shortcuts = loadShortcuts(this._settings);
        this._saveSourceId = 0;
        this._mountedRows = [];
        this._stackRows = [];

        const page = new Adw.PreferencesPage();
        window.add(page);

        this._buildApiGroup(page);
        this._buildShortcutsGroup(page);
        this._buildStackGroup(page);
        this._buildHelpGroup(page);

        window.connect('close-request', () => {
            this._flushSave();
            return false;
        });
    }

    // ------------------------------------------------------------------
    // API
    // ------------------------------------------------------------------

    _buildApiGroup(page) {
        const group = new Adw.PreferencesGroup({ title: 'API' });
        page.add(group);

        const endpointRow = new Adw.EntryRow({
            title: 'Endpoint',
            text: this._settings.get_string('api-endpoint'),
        });
        group.add(endpointRow);
        endpointRow.connect('notify::text', row => {
            this._settings.set_string('api-endpoint', row.get_text());
        });

        const modelRow = new Adw.EntryRow({
            title: 'Modelo',
            text: this._settings.get_string('model-name'),
        });
        group.add(modelRow);
        modelRow.connect('notify::text', row => {
            this._settings.set_string('model-name', row.get_text());
        });

        const apiKeyRow = new Adw.PasswordEntryRow({
            title: 'API key',
            text: this._settings.get_string('api-key'),
        });
        group.add(apiKeyRow);
        apiKeyRow.connect('notify::text', row => {
            this._settings.set_string('api-key', row.get_text());
        });

        const streamRow = new Adw.SwitchRow({
            title: 'Streaming (SSE)',
            subtitle: 'Mostra a resposta ao vivo; requer suporte do gateway',
        });
        this._settings.bind('stream', streamRow, 'active', 0);
        group.add(streamRow);

        const timeoutAdjustment = new Gtk.Adjustment({
            lower: 5,
            upper: 600,
            step_increment: 5,
            page_increment: 30,
            value: this._settings.get_int('request-timeout'),
        });
        const timeoutRow = new Adw.SpinRow({
            title: 'Timeout (segundos)',
            adjustment: timeoutAdjustment,
            digits: 0,
        });
        group.add(timeoutRow);
        timeoutRow.connect('notify::value', row => {
            this._settings.set_int('request-timeout', Math.round(row.get_value()));
        });
    }

    // ------------------------------------------------------------------
    // Shortcuts
    // ------------------------------------------------------------------

    _buildShortcutsGroup(page) {
        this._shortcutGroup = new Adw.PreferencesGroup({
            title: 'Atalhos e prompts',
        });
        page.add(this._shortcutGroup);

        this._warningRow = new Adw.ActionRow({
            title: 'Avisos de configuração',
            visible: false,
        });

        this._addRow = new Adw.ActionRow({
            title: 'Adicionar atalho',
            subtitle: 'Capture a tecla e escreva o prompt deste atalho',
        });
        const addButton = new Gtk.Button({
            label: 'Adicionar',
            valign: Gtk.Align.CENTER,
        });
        addButton.add_css_class('suggested-action');
        addButton.connect('clicked', () => this._addShortcut());
        this._addRow.add_suffix(addButton);
        this._addRow.set_activatable_widget(addButton);

        this._rebuildShortcutRows();
    }

    _rebuildShortcutRows() {
        for (const row of this._mountedRows)
            this._shortcutGroup.remove(row);
        this._mountedRows = [];

        this._shortcutGroup.add(this._warningRow);
        this._mountedRows.push(this._warningRow);

        this._shortcuts.forEach((shortcut, index) => {
            const row = this._createShortcutRow(shortcut, index);
            this._shortcutGroup.add(row);
            this._mountedRows.push(row);
        });

        this._shortcutGroup.add(this._addRow);
        this._mountedRows.push(this._addRow);

        this._refreshWarnings();
    }

    _createShortcutRow(shortcut, index) {
        const expander = new Adw.ExpanderRow({
            title: shortcut.label || `Atalho ${index + 1}`,
            subtitle: shortcut.accel
                ? this._accelLabel(shortcut.accel)
                : 'sem atalho',
        });

        const removeButton = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Remover este atalho',
        });
        removeButton.add_css_class('flat');
        removeButton.connect('clicked', () => this._removeShortcut(shortcut));
        expander.add_suffix(removeButton);

        const nameRow = new Adw.EntryRow({
            title: 'Nome',
            text: shortcut.label,
        });
        nameRow.connect('notify::text', row => {
            shortcut.label = row.get_text();
            expander.set_title(shortcut.label || `Atalho ${index + 1}`);
            this._scheduleSave();
        });
        expander.add_row(nameRow);

        const accelRow = new Adw.ActionRow({
            title: 'Atalho',
            subtitle: 'Clique na combinação e pressione a nova tecla',
        });
        const accelButton = new Gtk.Button({
            label: this._accelLabel(shortcut.accel),
            valign: Gtk.Align.CENTER,
        });
        this._attachKeyCapture(accelButton, shortcut, expander);
        accelRow.add_suffix(accelButton);
        accelRow.set_activatable_widget(accelButton);
        expander.add_row(accelRow);

        const modeRow = new Adw.ComboRow({
            title: 'Ação',
            model: Gtk.StringList.new(MODES.map(mode => modeLabel(mode))),
            selected: Math.max(0, MODES.indexOf(shortcut.mode)),
        });
        expander.add_row(modeRow);

        const promptBox = this._buildPromptBox(shortcut);
        promptBox.set_visible(needsPrompt(shortcut.mode));
        expander.add_row(promptBox);

        modeRow.connect('notify::selected', row => {
            shortcut.mode = MODES[row.get_selected()] ?? 'push-process';
            promptBox.set_visible(needsPrompt(shortcut.mode));
            this._scheduleSave();
        });

        return expander;
    }

    _buildPromptBox(shortcut) {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 12,
            margin_end: 12,
        });

        const label = new Gtk.Label({
            label: 'Prompt do usuário (enviado como system message)',
            xalign: 0,
        });
        label.add_css_class('dim-label');
        box.append(label);

        const buffer = new Gtk.TextBuffer();
        buffer.set_text(shortcut.prompt ?? '', -1);

        const view = new Gtk.TextView({
            buffer,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            height_request: 84,
            top_margin: 6,
            bottom_margin: 6,
            left_margin: 6,
            right_margin: 6,
        });

        const frame = new Gtk.Frame({ child: view });
        box.append(frame);

        buffer.connect('changed', () => {
            const [start, end] = buffer.get_bounds();
            shortcut.prompt = buffer.get_text(start, end, false);
            this._scheduleSave();
        });

        return box;
    }

    _attachKeyCapture(button, shortcut, expander) {
        let capturing = false;
        const controller = new Gtk.EventControllerKey();
        button.add_controller(controller);

        const restoreLabel = () => button.set_label(this._accelLabel(shortcut.accel));

        button.connect('clicked', () => {
            capturing = true;
            button.set_label('Pressione a combinação…');
            button.grab_focus();
        });

        controller.connect('key-pressed', (_controller, keyval, _keycode, state) => {
            if (!capturing)
                return false;

            if (MODIFIER_KEYS.has(keyval))
                return true;

            if (keyval === Gdk.KEY_Escape) {
                capturing = false;
                restoreLabel();
                return true;
            }

            const mods = state & MOD_MASK;

            if (
                (keyval === Gdk.KEY_BackSpace || keyval === Gdk.KEY_Delete) &&
                mods === 0
            ) {
                shortcut.accel = '';
                capturing = false;
                restoreLabel();
                expander.set_subtitle('sem atalho');
                this._scheduleSave(true);
                return true;
            }

            const hasModifier =
                mods &
                (Gdk.ModifierType.SUPER_MASK |
                    Gdk.ModifierType.ALT_MASK |
                    Gdk.ModifierType.CONTROL_MASK |
                    Gdk.ModifierType.HYPER_MASK);
            if (!hasModifier) {
                button.set_label('Use Super, Alt ou Ctrl');
                return true;
            }

            const accel = Gtk.accelerator_name(keyval, mods);
            const [valid] = Gtk.accelerator_parse(accel);
            if (!valid) {
                button.set_label('Combinação inválida');
                return true;
            }

            shortcut.accel = canonicalAccel(accel);
            capturing = false;
            restoreLabel();
            expander.set_subtitle(this._accelLabel(shortcut.accel));
            this._scheduleSave(true);
            return true;
        });
    }

    _accelLabel(accel) {
        if (!accel)
            return 'Definir…';
        const [ok, keyval, mods] = Gtk.accelerator_parse(accel);
        if (!ok)
            return accel;
        return Gtk.accelerator_get_label(keyval, mods);
    }

    _addShortcut() {
        if (this._shortcuts.length >= MAX_SHORTCUTS) {
            this._showWarning(`Limite de ${MAX_SHORTCUTS} atalhos atingido`);
            return;
        }
        this._shortcuts.push({
            id: makeId(),
            label: `Atalho ${this._shortcuts.length + 1}`,
            accel: '',
            mode: 'push-process',
            prompt: '',
        });
        this._rebuildShortcutRows();
        this._scheduleSave(true);
    }

    _removeShortcut(shortcut) {
        const index = this._shortcuts.indexOf(shortcut);
        if (index >= 0)
            this._shortcuts.splice(index, 1);
        this._rebuildShortcutRows();
        this._scheduleSave(true);
    }

    _refreshWarnings() {
        const { errors, warnings } = validateShortcuts(this._shortcuts);
        const messages = [...errors, ...warnings]
            .map(item => `#${item.index + 1} ${item.message}`)
            .filter((message, index, all) => all.indexOf(message) === index);

        if (messages.length === 0) {
            this._warningRow.set_visible(false);
            return;
        }
        this._warningRow.set_subtitle(messages.join(' · '));
        this._warningRow.set_visible(true);
    }

    _showWarning(message) {
        this._warningRow.set_subtitle(message);
        this._warningRow.set_visible(true);
    }

    _scheduleSave(immediate = false) {
        if (this._saveSourceId) {
            GLib.source_remove(this._saveSourceId);
            this._saveSourceId = 0;
        }
        if (immediate) {
            this._flushSave();
            return;
        }
        this._saveSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            350,
            () => {
                this._saveSourceId = 0;
                this._flushSave();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _flushSave() {
        if (this._saveSourceId) {
            GLib.source_remove(this._saveSourceId);
            this._saveSourceId = 0;
        }
        saveShortcuts(this._settings, this._shortcuts.slice(0, MAX_SHORTCUTS));
        this._refreshWarnings();
    }

    // ------------------------------------------------------------------
    // Stack / FIFO
    // ------------------------------------------------------------------

    _buildStackGroup(page) {
        const group = new Adw.PreferencesGroup({ title: 'Nexus — pilha, fila e histórico' });
        page.add(group);
        this._stackGroup = group;

        this._processShortcuts = this._shortcuts.filter(shortcut =>
            needsPrompt(shortcut.mode)
        );
        this._processModeRow = new Adw.ComboRow({
            title: 'Prompt para processar itens',
            subtitle: 'Escolha qual atalho será aplicado ao item selecionado',
            model: Gtk.StringList.new(
                this._processShortcuts.map(item => item.label || 'Atalho sem nome')
            ),
            selected: 0,
        });
        group.add(this._processModeRow);

        this._stackRow = new Adw.ActionRow({ title: 'Pilha LIFO' });
        group.add(this._stackRow);

        this._fifoRow = new Adw.ActionRow({ title: 'Fila FIFO' });
        group.add(this._fifoRow);

        const clearStack = new Gtk.Button({
            label: 'Limpar',
            valign: Gtk.Align.CENTER,
        });
        clearStack.add_css_class('destructive-action');
        clearStack.connect('clicked', () => {
            store.saveStack(null, store.emptyState());
            this._refreshStackRows();
        });
        this._stackRow.add_suffix(clearStack);

        const clearFifo = new Gtk.Button({
            label: 'Limpar',
            valign: Gtk.Align.CENTER,
        });
        clearFifo.add_css_class('destructive-action');
        clearFifo.connect('clicked', () => {
            store.saveFifo(null, store.emptyState());
            this._refreshStackRows();
        });
        this._fifoRow.add_suffix(clearFifo);

        const dirRow = new Adw.ActionRow({
            title: 'Pasta de dados',
            subtitle: store.dataDir(),
        });
        group.add(dirRow);

        const clearHistory = new Gtk.Button({
            label: 'Limpar histórico',
            valign: Gtk.Align.CENTER,
        });
        const historyRow = new Adw.ActionRow({
            title: 'history.jsonl',
            subtitle: 'Log append-only de inferências',
        });
        historyRow.add_suffix(clearHistory);
        clearHistory.add_css_class('destructive-action');
        clearHistory.connect('clicked', () => {
            store.clearHistory(null);
            historyRow.set_subtitle('Histórico limpo');
        });
        group.add(historyRow);

        this._refreshStackRows();
    }

    _refreshStackRows() {
        const stack = store.loadStack();
        const fifo = store.loadFifo();
        const top = store.peek(stack);

        for (const row of this._stackRows)
            this._stackGroup.remove(row);
        this._stackRows = [];

        this._stackRow.set_title(`Pilha do Nexus (${stack.items.length})`);
        this._stackRow.set_subtitle(
            top ? `${top.kind === 'result' ? 'resultado' : 'entrada'}: ${preview(top.text)}` : 'vazia'
        );

        stack.items.forEach((item, index) => {
            const row = new Adw.ActionRow({
                title: `#${index + 1} · ${item.kind === 'result' ? 'Resultado' : 'Entrada'}`,
                subtitle: middlePreview(item.text),
            });
            row.set_tooltip_text(item.text);

            const copyButton = new Gtk.Button({
                label: 'Copiar',
                valign: Gtk.Align.CENTER,
                tooltip_text: 'Copiar item para o clipboard do sistema',
            });
            copyButton.connect('clicked', () => {
                Gdk.Display.get_default().get_clipboard().set(item.text);
            });
            row.add_suffix(copyButton);

            const processButton = new Gtk.Button({
                label: 'Processar',
                valign: Gtk.Align.CENTER,
                sensitive: this._processShortcuts.length > 0,
                tooltip_text: 'Processar este item com o prompt selecionado',
            });
            processButton.add_css_class('suggested-action');
            processButton.connect('clicked', () => this._processStackItem(item, processButton));
            row.add_suffix(processButton);

            const removeButton = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                valign: Gtk.Align.CENTER,
                tooltip_text: 'Remover este item da pilha',
            });
            removeButton.add_css_class('destructive-action');
            removeButton.connect('clicked', () => {
                const result = store.removeNode(store.loadStack(), item.id);
                store.saveStack(null, result.state);
                this._refreshStackRows();
            });
            row.add_suffix(removeButton);

            this._stackGroup.add(row);
            this._stackRows.push(row);
        });

        this._fifoRow.set_title(`Fila FIFO (${fifo.items.length})`);
        this._fifoRow.set_subtitle(
            fifo.items.length
                ? `próximo: ${preview(fifo.items[0].prompt, 110)}`
                : 'vazia'
        );
    }

    async _processStackItem(item, button) {
        const shortcut = this._processShortcuts[this._processModeRow.get_selected()];
        if (!shortcut)
            return;
        const prompt = String(shortcut.prompt ?? '').trim();
        if (!prompt)
            return;

        button.set_sensitive(false);
        button.set_label('Processando…');
        try {
            const config = readApiConfig(this._settings);
            const result = await chat({
                endpoint: config.endpoint,
                model: config.model,
                apiKey: config.apiKey,
                messages: buildMessages({ system: prompt, user: item.text }),
                timeoutSeconds: config.timeoutSeconds,
            });
            const output = String(result ?? '').trim();
            if (!output)
                throw new Error('Resposta vazia');

            const current = store.loadStack();
            const parent = current.items.find(node => node.id === item.id);
            if (!parent)
                throw new Error('O item foi removido durante o processamento');
            const saved = store.pushResult(current, output, {
                parentId: item.id,
                prompt,
            });
            store.saveStack(null, saved.state);
            store.appendHistory(null, {
                id: saved.node.id,
                parentId: item.id,
                text: output,
                ts: Date.now(),
                prompt,
                mode: 'prefs-process-item',
                label: shortcut.label,
            });
            this._refreshStackRows();
        } catch (error) {
            button.set_tooltip_text(`Falha ao processar: ${error.message}`);
            button.set_label('Erro');
            return;
        }
        button.set_sensitive(true);
        button.set_label('Processar');
    }

    // ------------------------------------------------------------------
    // Help
    // ------------------------------------------------------------------

    _buildHelpGroup(page) {
        const group = new Adw.PreferencesGroup({
            title: 'Como funciona',
        });
        page.add(group);

        const pushRow = new Adw.ActionRow({
            title: 'Importar e processar',
            subtitle: 'Lê o clipboard do sistema, importa para o Nexus e aplica o prompt. O resultado fica no topo do Nexus; o clipboard do sistema não é sobrescrito.',
        });
        group.add(pushRow);

        const processRow = new Adw.ActionRow({
            title: 'Processar pilha',
            subtitle: 'Aplica o prompt ao topo do Nexus e empilha o resultado como novo item.',
        });
        group.add(processRow);

        const copyRow = new Adw.ActionRow({
            title: 'Copiar topo do Nexus para o sistema',
            subtitle: 'Exportação explícita (sem tecla padrão). No HUD, Enter também copia o item selecionado.',
        });
        group.add(copyRow);

        const chainRow = new Adw.ActionRow({
            title: 'Encadeamento',
            subtitle: 'Cada resultado vira um nó filho do item processado; use Desfazer para voltar.',
        });
        group.add(chainRow);
    }
}
