import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension, gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

class OrbitPanel {
    constructor(settings, monitor) {
        this._settings = settings;
        this._workspaceButtons = [];

        this.actor = new St.BoxLayout({
            style_class: 'orbit-panel',
            reactive: true,
            can_focus: false,
        });

        this._leftBox = new St.BoxLayout({
            style_class: 'orbit-panel-left',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._leftBox);

        this._rightBox = new St.BoxLayout({
            style_class: 'orbit-panel-right',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._rightBox);

        if (this._settings.get_boolean('show-apps-button'))
            this._addAppsButton();

        this._workspaceBox = new St.BoxLayout({
            style_class: 'orbit-workspaces',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._leftBox.add_child(this._workspaceBox);

        this._clock = new St.Label({
            style_class: 'orbit-clock',
            y_align: Clutter.ActorAlign.CENTER,
        });
        if (this._settings.get_boolean('show-clock'))
            this._rightBox.add_child(this._clock);

        this._refreshWorkspaces();
        this._updateClock();
        this._clockTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 30, () => {
                this._updateClock();
                return GLib.SOURCE_CONTINUE;
            });

        const height = this._settings.get_int('panel-height');
        const centered = this._settings.get_string('panel-position') === 'top-center';
        const [, naturalWidth] = this.actor.get_preferred_width(height);
        const width = centered ? Math.min(naturalWidth, monitor.width) : monitor.width;
        const x = monitor.x + Math.floor((monitor.width - width) / 2);
        this.actor.set_position(x, monitor.y);
        this.actor.set_size(width, height);

        Main.layoutManager.addChrome(this.actor, {
            affectsStruts: true,
            trackFullscreen: true,
        });
    }

    _addAppsButton() {
        const button = new St.Button({
            style_class: 'orbit-button orbit-apps-button',
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        const content = new St.BoxLayout({
            style_class: 'orbit-apps-content',
            y_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(new St.Icon({
            icon_name: 'view-app-grid-symbolic',
            style_class: 'orbit-apps-icon',
        }));
        content.add_child(new St.Label({
            text: _('Apps'),
            y_align: Clutter.ActorAlign.CENTER,
        }));
        button.set_child(content);
        button.connect('clicked', () => Main.overview.showApps());
        this._leftBox.add_child(button);
    }

    _refreshWorkspaces() {
        this._workspaceBox.get_children().forEach(child => {
            this._workspaceBox.remove_child(child);
            child.destroy();
        });
        this._workspaceButtons = [];

        if (!this._settings.get_boolean('show-workspaces')) {
            this._workspaceBox.hide();
            return;
        }

        this._workspaceBox.show();
        const manager = global.workspace_manager;
        for (let index = 0; index < manager.n_workspaces; index++) {
            const button = new St.Button({
                style_class: 'orbit-button orbit-workspace-button',
                can_focus: true,
                reactive: true,
                track_hover: true,
            });
            button.set_child(new St.Label({
                text: String(index + 1),
                y_align: Clutter.ActorAlign.CENTER,
            }));
            button.connect('clicked', () => {
                manager.get_workspace_by_index(index).activate(global.get_current_time());
            });
            this._workspaceBox.add_child(button);
            this._workspaceButtons.push(button);
        }
        this.updateActiveWorkspace();
    }

    updateWorkspaces() {
        if (this._settings.get_boolean('show-workspaces') &&
            this._workspaceButtons.length !== global.workspace_manager.n_workspaces)
            this._refreshWorkspaces();
        else
            this.updateActiveWorkspace();
    }

    updateActiveWorkspace() {
        const activeIndex = global.workspace_manager.get_active_workspace_index();
        this._workspaceButtons.forEach((button, index) => {
            if (index === activeIndex)
                button.add_style_class_name('active');
            else
                button.remove_style_class_name('active');
        });
    }

    _updateClock() {
        if (!this._clock)
            return;

        const format = this._settings.get_string('clock-format');
        const timeOptions = {hour: 'numeric', minute: '2-digit'};
        if (format === '24h')
            timeOptions.hourCycle = 'h23';
        else if (format === '12h')
            timeOptions.hourCycle = 'h12';

        const now = new Date();
        const time = new Intl.DateTimeFormat(undefined, timeOptions).format(now);
        if (this._settings.get_boolean('show-date')) {
            const date = new Intl.DateTimeFormat(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
            }).format(now);
            this._clock.text = `${date}  ${time}`;
        } else {
            this._clock.text = time;
        }
    }

    destroy() {
        if (this._clockTimer) {
            GLib.source_remove(this._clockTimer);
            this._clockTimer = 0;
        }
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }
}

export default class OrbitPanelsExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._createDisplayIndicator();

        this._settingsChangedId = this._settings.connect('changed', () => this._rebuild());
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed',
            () => this._onMonitorsChanged());
        this._workspacesChangedId = global.workspace_manager.connect('notify::n-workspaces',
            () => this._updateWorkspaces());
        this._activeWorkspaceChangedId = global.window_manager.connect(
            'switch-workspace', () => this._updateWorkspaces());

        this._onMonitorsChanged();
    }

    _onMonitorsChanged() {
        const primaryIndex = Main.layoutManager.primaryIndex;
        if (primaryIndex >= 0 && primaryIndex <= 15 &&
            this._settings.get_int('primary-monitor-index') !== primaryIndex)
            this._settings.set_int('primary-monitor-index', primaryIndex);
        this._updateDisplayIndicator();
        this._rebuild();
    }

    _createDisplayIndicator() {
        this._displayIndicator = new PanelMenu.Button(0.0, _('Display status'), false);
        const content = new St.BoxLayout({
            style_class: 'panel-status-indicators-box',
            y_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(new St.Icon({
            icon_name: 'video-display-symbolic',
            style_class: 'system-status-icon',
        }));
        this._displayCount = new St.Label({
            style_class: 'system-status-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(this._displayCount);
        this._displayIndicator.add_child(content);
        Main.panel.addToStatusArea(`${this.uuid}-display-status`, this._displayIndicator, 0, 'right');
    }

    _updateDisplayIndicator() {
        if (!this._displayIndicator)
            return;

        const monitors = Main.layoutManager.monitors;
        const count = monitors.length;
        const summary = ngettext('%d monitor connected', '%d monitors connected', count)
            .replace('%d', String(count));
        this._displayCount.text = String(count);
        this._displayIndicator.accessible_name = summary;
        this._displayIndicator.menu.removeAll();
        this._displayIndicator.menu.addMenuItem(new PopupMenu.PopupMenuItem(summary, {
            reactive: false,
        }));

        if (count > 0)
            this._displayIndicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        monitors.forEach((monitor, index) => {
            const title = index === Main.layoutManager.primaryIndex
                ? _('Primary display')
                : `${_('Display')} ${index + 1}`;
            const details = `${monitor.width} x ${monitor.height} @ ${monitor.x}, ${monitor.y}`;
            this._displayIndicator.menu.addMenuItem(new PopupMenu.PopupMenuItem(
                `${title}: ${details}`, {reactive: false}));
        });
    }

    _rebuild() {
        this._destroyPanels();
        const monitors = Main.layoutManager.monitors;
        const primaryIndex = Main.layoutManager.primaryIndex;
        const disabled = new Set(this._settings.get_strv('disabled-monitors'));

        monitors.forEach((monitor, index) => {
            if (index === primaryIndex || disabled.has(`monitor-${index}`))
                return;
            this._panels.push(new OrbitPanel(this._settings, monitor));
        });
    }

    _updateWorkspaces() {
        this._panels.forEach(panel => panel.updateWorkspaces());
    }

    _destroyPanels() {
        this._panels?.forEach(panel => panel.destroy());
        this._panels = [];
    }

    disable() {
        this._destroyPanels();

        if (this._settingsChangedId)
            this._settings.disconnect(this._settingsChangedId);
        if (this._monitorsChangedId)
            Main.layoutManager.disconnect(this._monitorsChangedId);
        if (this._workspacesChangedId)
            global.workspace_manager.disconnect(this._workspacesChangedId);
        if (this._activeWorkspaceChangedId)
            global.window_manager.disconnect(this._activeWorkspaceChangedId);

        this._displayIndicator?.destroy();
        this._displayIndicator = null;
        this._displayCount = null;
        this._settings = null;
    }
}