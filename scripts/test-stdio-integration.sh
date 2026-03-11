#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
memory_root_dir="$(mktemp -d "${TMPDIR:-/tmp}/project-memory-stdio-XXXXXX")"
trap 'rm -rf "${memory_root_dir}"' EXIT

payload='{"jsonrpc":"2.0","id":"stdio-init-1","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"stdio-integration","version":"1.0.0"}}}'

output="$(
  cd "${repo_root}"
  timeout 2s bash -lc '
    payload='"'"${payload}"'"'
    printf '"'"'Content-Length: %s\r\n\r\n%s'"'"' "${#payload}" "$payload" |
      PROJECT_MEMORY_ROOT='"'"${memory_root_dir}"'"' \
      node --experimental-strip-types src/mcp/server.ts
  '
)"

PROJECT_MEMORY_STDIO_OUTPUT="${output}" node --input-type=module <<'EOF'
const output = process.env.PROJECT_MEMORY_STDIO_OUTPUT ?? "";
const separatorIndex = output.indexOf("\r\n\r\n");

if (separatorIndex === -1) {
  throw new Error("Missing framed stdio response separator");
}

const headerText = output.slice(0, separatorIndex);
const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
if (!contentLengthMatch) {
  throw new Error("Missing Content-Length header in stdio response");
}

const expectedLength = Number.parseInt(contentLengthMatch[1], 10);
const bodyText = output.slice(separatorIndex + 4);
if (Buffer.byteLength(bodyText, "utf8") !== expectedLength) {
  throw new Error("Content-Length does not match stdio response body");
}

const parsed = JSON.parse(bodyText);
if (parsed.jsonrpc !== "2.0") {
  throw new Error("Expected jsonrpc=2.0 in stdio response");
}

if (parsed.result?.protocolVersion !== "2024-11-05") {
  throw new Error("Expected supported protocol version in stdio initialize response");
}

if (parsed.result?.serverInfo?.name !== "project-memory") {
  throw new Error("Expected project-memory serverInfo.name in stdio initialize response");
}
EOF

printf '%s\n' "stdio integration passed"
