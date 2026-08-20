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
                   Start the local emulators and Expo in development-client mode
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

  if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
    EXPO_CMD=(pnpm exec expo)
  elif [[ -f yarn.lock ]] && command -v yarn >/dev/null 2>&1; then
    EXPO_CMD=(yarn expo)
  elif { [[ -f bun.lock ]] || [[ -f bun.lockb ]]; } && command -v bun >/dev/null 2>&1; then
    EXPO_CMD=(bunx expo)
  else
    EXPO_CMD=(npx expo)
  fi
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

resolve_expo_cmd

start_local_emulators() {
  local emulator_log
  emulator_log="${TMPDIR:-/tmp}/lumus-firebase-emulators.log"
  EMULATOR_PID=""

  port_ready() {
    timeout 1 bash -c "</dev/tcp/127.0.0.1/$1" >/dev/null 2>&1
  }

  emulators_ready() {
    port_ready 4400 && port_ready 9099 && port_ready 8080 && port_ready 5001
  }

  # Reuse a healthy Suite instead of starting a second one and allowing the
  # Firebase CLI to move ports (which would make the seed target the wrong DB).
  if emulators_ready; then
    echo "Firebase Emulator Suite já está disponível; reutilizando as portas 9099/8080/5001."
  else
    if port_ready 4400 || port_ready 9099 || port_ready 8080 || port_ready 5001; then
      echo "Portas do Firebase Emulator parcialmente ocupadas. Encerre a Suite existente antes de tentar novamente." >&2
      exit 1
    fi

    npx -y firebase-tools@latest emulators:start --project emulator --only auth,firestore,functions >"$emulator_log" 2>&1 &
    EMULATOR_PID=$!
    cleanup_emulators() {
      if [[ -n "$EMULATOR_PID" ]]; then
        kill "$EMULATOR_PID" 2>/dev/null || true
        wait "$EMULATOR_PID" 2>/dev/null || true
      fi
    }
    trap cleanup_emulators EXIT INT TERM

    for _ in {1..90}; do
      if emulators_ready; then
        break
      fi
      sleep 1
    done
    if ! emulators_ready; then
      cat "$emulator_log" >&2
      exit 1
    fi
  fi

  # The Hub can be online before Firestore finishes binding. At this point all
  # three service ports are reachable, so the reset/seed request is safe.
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=demo-lumus-financas npm --prefix backend run seed
  if command -v adb >/dev/null 2>&1; then
    adb reverse tcp:9099 tcp:9099 || true
    adb reverse tcp:8080 tcp:8080 || true
    adb reverse tcp:5001 tcp:5001 || true
  fi
  return
}

case "$MODE" in
  start|run)
    start_local_emulators
    EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_FIREBASE_TARGET=emulator EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 "${EXPO_CMD[@]}" start
    ;;
  --ios|ios)
    exec "${EXPO_CMD[@]}" start --ios
    ;;
  --android|android)
    start_local_emulators
    EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_FIREBASE_TARGET=emulator EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 "${EXPO_CMD[@]}" start --android
    ;;
  --web|web)
    start_local_emulators
    EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_FIREBASE_TARGET=emulator EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 "${EXPO_CMD[@]}" start --web
    ;;
  --dev-client|dev-client)
    start_local_emulators
    EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_FIREBASE_TARGET=emulator EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 "${EXPO_CMD[@]}" start --dev-client
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
