#!/bin/bash
set -euo pipefail

APP_DIR="${CINEPHAGE_APP_DIR:-/app}"
if [ ! -d "$APP_DIR" ]; then
	APP_DIR="$(pwd)"
fi
SCRIPTS_DIR="$APP_DIR/scripts"
CMD_NAME="$(basename "$0")"

usage() {
	echo "Usage: $CMD_NAME <script> [args...]"
	echo ''
	echo 'Resolves and runs scripts without npm/npx.'
	echo 'Accepted <script> forms:'
	echo '  1) Script file name in /app/scripts (with or without extension)'
	echo "     Example: $CMD_NAME fix-tv-subtitle-paths"
	echo '  2) npm script alias from package.json that matches: node scripts/<file>'
	echo "     Example: $CMD_NAME fix:tv-subtitles"
	echo '  3) Direct path relative to /app or absolute path'
	echo "     Example: $CMD_NAME scripts/fix-tv-subtitle-paths.js"
	echo ''
	echo 'Options:'
	echo '  --list   List available scripts in /app/scripts'
	echo '  -h, --help'
}

list_scripts() {
	if [ ! -d "$SCRIPTS_DIR" ]; then
		echo "No scripts directory found at $SCRIPTS_DIR"
		return
	fi

	echo "Scripts in $SCRIPTS_DIR:"
	find "$SCRIPTS_DIR" -maxdepth 1 -type f \
		\( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.ts' \) \
		-printf '  - %f\n' | sort
}

resolve_by_script_name() {
	local name="$1"
	local candidate

	if [ -f "$SCRIPTS_DIR/$name" ]; then
		echo "$SCRIPTS_DIR/$name"
		return 0
	fi

	for ext in js mjs cjs ts; do
		candidate="$SCRIPTS_DIR/$name.$ext"
		if [ -f "$candidate" ]; then
			echo "$candidate"
			return 0
		fi
	done

	return 1
}

resolve_from_package_script_alias() {
	local alias="$1"

	node -e '
const fs = require("node:fs");
const path = require("node:path");
const alias = process.argv[1];
const pkgPath = process.argv[2];
try {
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
	const command = (pkg.scripts || {})[alias];
	if (!command) process.exit(0);
	const match = command.match(/^node\s+((?:\.\/)?scripts\/[^\s]+)$/);
	if (!match) process.exit(0);
	process.stdout.write(path.normalize(match[1]));
} catch {
	process.exit(0);
}
' "$alias" "$APP_DIR/package.json"
}

if [ "${1:-}" = '--list' ]; then
	list_scripts
	exit 0
fi

if [ "${1:-}" = '-h' ] || [ "${1:-}" = '--help' ] || [ $# -eq 0 ]; then
	usage
	exit 0
fi

target="$1"
shift

resolved_path=''

if [[ "$target" == /* ]]; then
	if [ -f "$target" ]; then
		resolved_path="$target"
	fi
elif [[ "$target" == *'/'* ]] || [[ "$target" == *.js ]] || [[ "$target" == *.mjs ]] || [[ "$target" == *.cjs ]] || [[ "$target" == *.ts ]]; then
	if [ -f "$APP_DIR/$target" ]; then
		resolved_path="$APP_DIR/$target"
	fi
fi

if [ -z "$resolved_path" ]; then
	if resolved="$(resolve_by_script_name "$target")"; then
		resolved_path="$resolved"
	fi
fi

if [ -z "$resolved_path" ]; then
	if relative_path="$(resolve_from_package_script_alias "$target")" && [ -n "$relative_path" ]; then
		relative_path="${relative_path#./}"
		if [ -f "$APP_DIR/$relative_path" ]; then
			resolved_path="$APP_DIR/$relative_path"
		fi
	fi
fi

if [ -z "$resolved_path" ]; then
	echo "Unable to resolve script: $target"
	echo ''
	list_scripts
	exit 1
fi

if [[ "$resolved_path" == *.ts ]]; then
	echo "Cannot run TypeScript script directly without tsx/ts-node in runtime image:"
	echo "  $resolved_path"
	exit 1
fi

exec node "$resolved_path" "$@"
