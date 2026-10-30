#!/bin/zsh

set -eu
cd -- "$(dirname -- "$0")"

npm run build:local

port=5818
while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
  port=$((port + 1))
done

python3 -m http.server "$port" --bind 127.0.0.1 --directory dist >/private/tmp/math-book-navigator.log 2>&1 &
server_pid=$!
sleep 1

if ! kill -0 "$server_pid" >/dev/null 2>&1; then
  echo "Simon Math Book could not start. See /private/tmp/math-book-navigator.log"
  exit 1
fi

open "http://127.0.0.1:${port}/index.html"
