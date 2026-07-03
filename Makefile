# Snapstore release tasks.
# PACKAGES are in dependency order: core has no deps; url/react/form build on it.
# Publishing in this order means each package's deps are already on the registry.
PACKAGES := core url react form

.DEFAULT_GOAL := help

.PHONY: help install build test clean publish publish-dry deprecate-old $(addprefix publish-,$(PACKAGES))

help: ## List available targets
	@grep -E '^[a-zA-Z_%-]+:.*## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install workspace dependencies
	npm install

build: ## Build all packages (dependency order)
	npm run build

test: ## Run the test suite
	npm test

clean: ## Remove all package build output
	rm -rf packages/*/dist

publish: build test ## Build, test, then publish every package to npm in order
	@for pkg in $(PACKAGES); do \
		echo "==> publishing @snapstore/$$pkg"; \
		( cd packages/$$pkg && npm publish ) || exit 1; \
	done
	@echo "All packages published."

publish-dry: build ## Pack every package and show what would publish (no upload)
	@for pkg in $(PACKAGES); do \
		echo "==> [dry-run] @snapstore/$$pkg"; \
		( cd packages/$$pkg && npm publish --dry-run ) || exit 1; \
	done

publish-%: build ## Publish one package, e.g. `make publish-react`
	cd packages/$* && npm publish

deprecate-old: ## Point the old @thalesfp/snapstate at the new packages
	npm deprecate "@thalesfp/snapstate" "Renamed. Install @snapstore/core, @snapstore/react, @snapstore/form, @snapstore/url"
