import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';

import {ExtensionPreferences, gettext as _} from
    'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DISPLAY_PREFIX = 'monitor-';

export default class OrbitPanelsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title: _('Panels'),
            icon_name: 'video-display-symbolic',
        });
        window.add(page);
        window.set_default_size(620, 720);

        const displaysGroup = new Adw.PreferencesGroup({
            title: _('Displays'),
            description: _('Choose which secondary displays receive an Orbit panel.'),
        });
        page.add(displaysGroup);

        const display = Gdk.Display.get_default();
        const monitorModel = display?.get_monitors() ?? null;
        const displayRows = [];
        let noDisplaysRow = null;
        const rebuildDisplayRows = () => {
            displayRows.forEach(row => displaysGroup.remove(row));
            displayRows.length = 0;
            if (noDisplaysRow) {
                displaysGroup.remove(noDisplaysRow);
                noDisplaysRow = null;
            }

            if (!monitorModel || monitorModel.get_n_items() < 2) {
                noDisplaysRow = new Adw.ActionRow({
                    title: _('No secondary display detected'),
                    subtitle: _('Connect another display to configure its panel.'),
                });
                displaysGroup.add(noDisplaysRow);
                return;
            }

            const primaryIndex = settings.get_int('primary-monitor-index');
            const disabled = new Set(settings.get_strv('disabled-monitors'));
            for (let index = 0; index < monitorModel.get_n_items(); index++) {
                const monitor = monitorModel.get_item(index);
                const geometry = monitor.get_geometry();
                const isPrimary = index === primaryIndex;
                const details = monitor.get_description?.() ??
                    monitor.get_model?.() ?? monitor.get_connector?.() ?? '';
                const row = new Adw.SwitchRow({
                    title: isPrimary ? _('Primary display') : `${_('Display')} ${index + 1}`,
                    subtitle: isPrimary
                        ? _('Uses the standard GNOME top bar')
                        : `${details ? `${details} · ` : ''}${geometry.width} × ${geometry.height}`,
                    active: !isPrimary && !disabled.has(`${DISPLAY_PREFIX}${index}`),
                    sensitive: !isPrimary,
                });
                row.connect('notify::active', () => {
                    if (isPrimary)
                        return;
                    const current = new Set(settings.get_strv('disabled-monitors'));
                    const id = `${DISPLAY_PREFIX}${index}`;
                    if (row.active)
                        current.delete(id);
                    else
                        current.add(id);
                    settings.set_strv('disabled-monitors', [...current]);
                });
                displaysGroup.add(row);
                displayRows.push(row);
            }
        };
        rebuildDisplayRows();

        const appearanceGroup = new Adw.PreferencesGroup({
            title: _('Panel layout'),
        });
        page.add(appearanceGroup);

        const positionModel = new Gtk.StringList();
        positionModel.append(_('Top edge'));
        positionModel.append(_('Top center'));
        const positionRow = new Adw.ComboRow({
            title: _('Position'),
            model: positionModel,
        });
        const setPosition = () => {
            positionRow.selected = settings.get_string('panel-position') === 'top-center' ? 1 : 0;
        };
        setPosition();
        positionRow.connect('notify::selected', () => {
            settings.set_string('panel-position', positionRow.selected === 1 ? 'top-center' : 'top');
        });
        const positionChangedId = settings.connect('changed::panel-position', setPosition);
        appearanceGroup.add(positionRow);

        const heightRow = new Adw.ActionRow({
            title: _('Panel height'),
            subtitle: _('Logical pixels'),
        });
        const heightControl = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 28,
                upper: 48,
                step_increment: 2,
                page_increment: 4,
                value: settings.get_int('panel-height'),
            }),
            numeric: true,
            snap_to_ticks: true,
            valign: Gtk.Align.CENTER,
        });
        heightControl.connect('value-changed', () => {
            settings.set_int('panel-height', Math.round(heightControl.get_value()));
        });
        const heightChangedId = settings.connect('changed::panel-height', () => {
            const value = settings.get_int('panel-height');
            if (Math.round(heightControl.get_value()) !== value)
                heightControl.set_value(value);
        });
        heightRow.add_suffix(heightControl);
        appearanceGroup.add(heightRow);

        const contentGroup = new Adw.PreferencesGroup({
            title: _('Panel contents'),
        });
        page.add(contentGroup);
        this._addSwitch(settings, contentGroup, 'show-apps-button', _('Apps button'),
            _('Open the GNOME app overview from any display.'));
        this._addSwitch(settings, contentGroup, 'show-workspaces', _('Workspaces'),
            _('Switch workspaces directly from each panel.'));
        this._addSwitch(settings, contentGroup, 'show-clock', _('Clock'),
            _('Show the current local time.'));
        this._addSwitch(settings, contentGroup, 'show-date', _('Date'),
            _('Show the localized date beside the clock.'));

        const clockModel = new Gtk.StringList();
        clockModel.append(_('System locale'));
        clockModel.append(_('24-hour'));
        clockModel.append(_('12-hour'));
        const clockRow = new Adw.ComboRow({
            title: _('Clock format'),
            model: clockModel,
        });
        const formats = ['locale', '24h', '12h'];
        const setClockFormat = () => {
            const index = formats.indexOf(settings.get_string('clock-format'));
            clockRow.selected = index < 0 ? 0 : index;
        };
        setClockFormat();
        clockRow.connect('notify::selected', () => {
            settings.set_string('clock-format', formats[clockRow.selected] ?? 'locale');
        });
        const clockFormatChangedId = settings.connect('changed::clock-format', setClockFormat);
        contentGroup.add(clockRow);

        const monitorItemsChangedId = monitorModel?.connect('items-changed', rebuildDisplayRows) ?? 0;
        const primaryChangedId = settings.connect('changed::primary-monitor-index', rebuildDisplayRows);
        window.connect('close-request', () => {
            if (monitorItemsChangedId)
                monitorModel.disconnect(monitorItemsChangedId);
            settings.disconnect(primaryChangedId);
            settings.disconnect(positionChangedId);
            settings.disconnect(heightChangedId);
            settings.disconnect(clockFormatChangedId);
            return false;
        });
    }

    _addSwitch(settings, group, key, title, subtitle) {
        const row = new Adw.SwitchRow({title, subtitle});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
    }
}