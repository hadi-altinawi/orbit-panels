# Orbit Panels

Orbit Panels is a GNOME Shell extension for Ubuntu 26. It adds configurable panels to secondary displays, either across the top edge or centered at the top. Panels can show workspace switching, the GNOME app overview launcher, and a localized clock/date. A top-bar display indicator shows the connected-monitor count and display geometry. Panels update when monitors are connected or disconnected and hide for fullscreen windows.

## Requirements

- Ubuntu 26 with GNOME Shell 50 or 51
- GNOME Shell extension tools (`gnome-extensions`)
- `glib-compile-schemas` for schema checks during development

## Install

From this directory, run:

```sh
make enable
```

If the extension was installed while GNOME Shell was already running, GNOME discovers it at the next login. `make enable` records the enabled state and tells you to log out and back in when this is needed.

To package and install without enabling:

```sh
make install
```

After GNOME has discovered the extension in a new session, enable it with:

```sh
gnome-extensions enable orbit-panels@orbitpanels.dev
```

Open the extension settings from the Extensions app or run:

```sh
gnome-extensions prefs orbit-panels@orbitpanels.dev
```

## Configure

Use the preferences page to enable panels per secondary display, choose top-edge or top-center placement, set panel height, and choose which controls appear. Workspace changes are shared with GNOME across displays. The primary display keeps its standard GNOME panel.

## Development checks

```sh
glib-compile-schemas --strict --dry-run schemas/
node --check extension.js
node --check prefs.js
make pack
```
