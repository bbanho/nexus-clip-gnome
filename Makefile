UUID = nexus-clip@bbanho
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: check compile-schemas hooks install uninstall enable disable smoke pack structural

compile-schemas:
	glib-compile-schemas --strict extension/schemas

hooks:
	chmod +x .githooks/pre-commit .githooks/pre-push
	git config core.hooksPath .githooks
	@echo "Git hooks enabled: core.hooksPath=.githooks (make check on commit/push)"

pack: compile-schemas
	mkdir -p dist
	gnome-extensions pack --force --extra-source=lib --out-dir dist extension

check: compile-schemas
	node --test
	@for f in extension/extension.js extension/prefs.js extension/lib/*.js; do \
		node --check "$$f" || exit 1; \
	done
	gjs -m tests/gjs-store-smoke.mjs
	@if command -v ast-grep >/dev/null 2>&1; then \
		ast-grep scan; \
	else \
		echo "ast-grep not installed; skipping structural scan (see 'make structural')"; \
	fi

# Structural invariant gate (ast-grep). AST-level companion to the regex-based
# tests/shell-boundary.test.js. Rules live in rules/ (see sgconfig.yml).
structural:
	@command -v ast-grep >/dev/null 2>&1 || { echo "ast-grep is not installed (e.g. brew install ast-grep)"; exit 1; }
	ast-grep scan

smoke:
	gjs -m tests/gjs-client-smoke.mjs

install: compile-schemas
	mkdir -p $(EXT_DIR)
	cp extension/metadata.json $(EXT_DIR)/
	cp extension/extension.js $(EXT_DIR)/
	cp extension/prefs.js $(EXT_DIR)/
	rm -rf $(EXT_DIR)/lib $(EXT_DIR)/schemas
	cp -r extension/lib $(EXT_DIR)/
	cp -r extension/schemas $(EXT_DIR)/
	chmod -R u+wX $(EXT_DIR)

uninstall:
	rm -rf $(EXT_DIR)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)
