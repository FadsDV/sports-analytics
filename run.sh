#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INTERNAL_MODE="${1:-}"

wait_and_open_browser() {
  # Next dev usually starts on 3000, then increments if busy.
  # Probe a small range and open whichever port becomes responsive first.
  for _ in $(seq 1 180); do
    for port in 3000 3001 3002 3003 3004 3005; do
      if curl -fsS "http://127.0.0.1:${port}" >/dev/null 2>&1; then
        if command -v xdg-open >/dev/null 2>&1; then
          xdg-open "http://127.0.0.1:${port}" >/dev/null 2>&1 || true
        fi
        return 0
      fi
    done
    sleep 1
  done
  return 1
}

run_server() {
  # Clear the Next.js cache so CSS always rebuild fresh
  rm -rf "$SCRIPT_DIR/.next"
  cd "$SCRIPT_DIR" || exit 1
  wait_and_open_browser &
  npm run dev
  echo
  echo "--- Server stopped. Press Enter to close. ---"
  read
}

# If running in terminal already (or explicitly internal mode), run directly
if [ -t 1 ] || [ "$INTERNAL_MODE" = "--internal" ]; then
  run_server
  exit
fi

# Otherwise find a terminal emulator and launch inside it
if   command -v gnome-terminal &>/dev/null; then
  gnome-terminal -- bash -lc "\"$SCRIPT_DIR/run.sh\" --internal"
elif command -v konsole        &>/dev/null; then
  konsole -e bash -lc "\"$SCRIPT_DIR/run.sh\" --internal"
elif command -v xfce4-terminal &>/dev/null; then
  xfce4-terminal -e "bash -lc '\"$SCRIPT_DIR/run.sh\" --internal'"
elif command -v xterm          &>/dev/null; then
  xterm -e bash -lc "\"$SCRIPT_DIR/run.sh\" --internal"
else
  notify-send "SportsPulse" "No terminal emulator found. Please run ./run.sh from a terminal." 2>/dev/null
  echo "No terminal emulator found. Run this script from a terminal." >&2
  exit 1
fi
