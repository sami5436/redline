#!/bin/sh
# Saves an API key from the macOS clipboard to .env.local and to all Vercel
# environments, without echoing it. Run it, then copy the key: the script
# waits (up to 3 min) until the clipboard holds something key-shaped.
#   sh scripts/set-key.sh TAVILY_API_KEY
#   sh scripts/set-key.sh NEBIUS_API_KEY
set -eu
name="$1"
case "$name" in
  TAVILY_API_KEY) pattern='^tvly-[A-Za-z0-9_-]{20,}$' ;;
  *) pattern='^[A-Za-z0-9._-]{30,}$' ;;
esac
cd "$(dirname "$0")/.."

start="$(pbpaste | tr -d '[:space:]')"
echo "Waiting for $name on the clipboard. Copy the key now..."
i=0
while :; do
  value="$(pbpaste | tr -d '[:space:]')"
  if [ "$value" != "$start" ] || [ $i -eq 0 ]; then
    if printf %s "$value" | grep -Eq "$pattern"; then break; fi
  fi
  i=$((i + 1))
  [ $i -lt 180 ] || { echo "timed out: no key-shaped value appeared on the clipboard"; exit 1; }
  sleep 1
done

umask 077
touch .env.local
grep -v "^$name=" .env.local > .env.local.tmp || true
printf '%s=%s\n' "$name" "$value" >> .env.local.tmp
mv .env.local.tmp .env.local
echo ".env.local: $name saved (${#value} chars)"

for env in production preview development; do
  vercel env rm "$name" "$env" -y >/dev/null 2>&1 || true
  if printf %s "$value" | vercel env add "$name" "$env" >/dev/null 2>&1; then
    echo "vercel $env: ok"
  else
    echo "vercel $env: FAILED"
  fi
done
printf 'clipboard cleared\n' | pbcopy
