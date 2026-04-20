#!/usr/bin/env sh

cd .devcontainer
mkdir -p downloads/incomplete media config/transmission config/qbittorrent config/sabnzbd

PUID=$(id -u)
PGID=$(id -g)

touch .env

if ! grep -qE '^[[:space:]]*PUID=' .env; then
  echo "PUID=$PUID" >> .env
elif ! grep -qE '^[[:space:]]*PUID=[[:space:]]*[^[:space:]]' .env; then
  sed -i "s|PUID=.*$|PUID=$PUID|" .env
fi

if ! grep -qE '^[[:space:]]*PGID=' .env; then
  echo "PGID=$PGID" >> .env
elif ! grep -qE '^[[:space:]]*PGID=[[:space:]]*[^[:space:]]' .env; then
  sed -i "s|PGID=.*$|PGID=$PGID|" .env
fi
