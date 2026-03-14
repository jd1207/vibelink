#!/bin/bash
# auto-restart wrapper for the bridge server
# used by dashboard "rebuild & restart" button
cd "$(dirname "$0")"
while true; do
  npm run build 2>&1 | tail -1
  echo "starting bridge..."
  node dist/server.js
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo "bridge exited with code $EXIT_CODE, restarting in 2s..."
    sleep 2
  else
    echo "bridge exited cleanly, restarting..."
    sleep 0.5
  fi
done
