#!/usr/bin/env bash
set -euo pipefail

exec node --experimental-strip-types src/cli/index.ts push-pending-changes "$@"
