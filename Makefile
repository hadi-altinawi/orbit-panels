UUID = orbit-panels@orbitpanels.dev
DIST_DIR ?= $(HOME)/.cache/orbit-panels
BUNDLE = $(DIST_DIR)/$(UUID).shell-extension.zip

.PHONY: pack install enable disable uninstall

pack:
	mkdir -p "$(DIST_DIR)"
	gnome-extensions pack --force --out-dir "$(DIST_DIR)" .

install: pack
	gnome-extensions install --force "$(BUNDLE)"

enable: install
	@if gnome-extensions info "$(UUID)" >/dev/null 2>&1; then \
		gnome-extensions enable "$(UUID)"; \
	else \
		gjs -c 'const Gio = imports.gi.Gio; const settings = new Gio.Settings({schema_id: "org.gnome.shell"}); const uuid = "$(UUID)"; const enabled = settings.get_strv("enabled-extensions"); const disabled = settings.get_strv("disabled-extensions").filter(item => item !== uuid); if (!enabled.includes(uuid)) { enabled.push(uuid); settings.set_strv("enabled-extensions", enabled); } settings.set_strv("disabled-extensions", disabled);' && \
		printf '%s\n' "Orbit Panels is installed and enabled for the next GNOME login." "Log out and back in to load this newly installed extension."; \
	fi

disable:
	gnome-extensions disable "$(UUID)"

uninstall:
	gnome-extensions uninstall "$(UUID)"