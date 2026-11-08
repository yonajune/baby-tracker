set -euo pipefail

stamp=node_modules/.capy-install.sha256
inputs=$(sha256sum package.json package-lock.json .npmrc; node --version; npm --version)

if [ "${1:-}" = initialize ] || [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$inputs" ]; then
  npm ci
  printf '%s\n' "$inputs" > "$stamp"
fi
