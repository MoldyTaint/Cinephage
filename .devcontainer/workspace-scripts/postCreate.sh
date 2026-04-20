#!/usr/bin/env sh

if [ ! -f .env ]; then
  cp .env.example .env
fi

if ! grep -qE '^[[:space:]]*BETTER_AUTH_SECRET=[[:space:]]*[^[:space:]]' .env; then
  NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  sed -i "s|BETTER_AUTH_SECRET=.*$|BETTER_AUTH_SECRET=$NEW_SECRET|" .env
fi

npm install

# Fetch Camoufox browser payload on first boot for CAPTCHA solver support.
if [ ! -f "${HOME}/.cache/camoufox/version.json" ]; then
  npx --yes camoufox fetch
fi

# Ensure Camoufox binary is executable (required in some container filesystems).
if [ -f "${HOME}/.cache/camoufox/camoufox-bin" ]; then
  chmod +x "${HOME}/.cache/camoufox/camoufox-bin"
fi
