#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_OPTIONS= node "$script_dir/os-runtime-diagnostic.mjs" "$@"
