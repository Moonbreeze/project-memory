#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
env_file="${repo_root}/.project-memory.env"

if [[ ! -f "${env_file}" ]]; then
  printf '%s\n' "Missing ${env_file}. Run 'npm run install-memory -- --memory-root <path>' first." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${env_file}"

exec node --experimental-strip-types "${repo_root}/src/web/index.ts" "$@"
