UUID = nexus-clip@bbanho
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: compile-schemas install uninstall enable disable

compile-schemas:
	glib-compile-schemas extension/schemas

install: compile-schemas
	mkdir -p $(EXT_DIR)
	cp extension/metadata.json $(EXT_DIR)/
	cp extension/extension.js $(EXT_DIR)/
	cp extension/prefs.js $(EXT_DIR)/
	cp -r extension/lib $(EXT_DIR)/
	cp -r extension/schemas $(EXT_DIR)/
	chmod -R u+wX $(EXT_DIR)

uninstall:
	rm -rf $(EXT_DIR)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)
