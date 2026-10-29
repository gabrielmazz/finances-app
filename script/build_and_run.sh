#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-start}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

show_usage() {
  cat <<'USAGE'
usage: ./script/build_and_run.sh [mode]

Modes:
  start, run        Start the Expo dev server
  --ios, ios        Start Expo and open iOS
  --android, android
                   Start Expo and open Android
  --web, web        Start Expo for web
  --dev-client, dev-client
                   Start the Spark local emulators and Expo in development-client mode
  --tunnel, tunnel Start Expo using tunnel transport
  --export-web, export-web
                   Export the web build locally
  --doctor, doctor Run Expo diagnostics
  --help, help     Show this help
USAGE
}

resolve_expo_cmd() {
  if [[ -n "${EXPO_CLI:-}" ]]; then
    # shellcheck disable=SC2206
    EXPO_CMD=(${EXPO_CLI})
    return
  fi

  local expo_cli
  if ! expo_cli="$(node -p 'require.resolve("expo/bin/cli")' 2>/dev/null)"; then
    echo "Expo local não encontrado. Execute npm install antes de iniciar." >&2
    exit 1
  fi
  EXPO_CMD=(node "$expo_cli")
}

run_doctor() {
  if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
    pnpm exec expo-doctor
  elif [[ -f yarn.lock ]] && command -v yarn >/dev/null 2>&1; then
    yarn expo-doctor
  elif { [[ -f bun.lock ]] || [[ -f bun.lockb ]]; } && command -v bun >/dev/null 2>&1; then
    bunx expo-doctor
  else
    npx expo-doctor
  fi
}

# [[Guia de Testes Locais]]: todos os atalhos de desenvolvimento usam a mesma
# demonstração Spark, sem reutilizar nem limpar outros emuladores.
case "$MODE" in
  start|run) exec node script/spark_dev.js mobile ;;
  --web|web) exec node script/spark_dev.js web ;;
  --android|android) exec node script/spark_dev.js android ;;
  --dev-client|dev-client) exec node script/spark_dev.js client ;;
  --help|help|--doctor|doctor) ;;
  *) resolve_expo_cmd ;;
esac

case "$MODE" in
  --ios|ios)
    exec "${EXPO_CMD[@]}" start --ios
    ;;
  --tunnel|tunnel)
    exec "${EXPO_CMD[@]}" start --tunnel
    ;;
  --export-web|export-web)
    exec "${EXPO_CMD[@]}" export --platform web
    ;;
  --doctor|doctor)
    run_doctor
    ;;
  --help|help)
    show_usage
    ;;
  *)
    show_usage >&2
    exit 2
    ;;
esac
