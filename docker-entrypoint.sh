#!/bin/sh
set -eu
PUID="${PUID:-1000}"; PGID="${PGID:-1000}"; UMASK="${UMASK:-0022}"
getent group "$PGID" >/dev/null 2>&1 || addgroup -g "$PGID" arrsight-runtime
GROUP_NAME="$(getent group "$PGID" | cut -d: -f1)"
APP_USER="$(getent passwd "$PUID" | cut -d: -f1 || true)"
if [ -z "$APP_USER" ]; then adduser -D -H -u "$PUID" -G "$GROUP_NAME" arrsight; APP_USER=arrsight; fi
sed -i "s/^${APP_USER}:\([^:]*\):${PUID}:[0-9]*/${APP_USER}:\1:${PUID}:${PGID}/" /etc/passwd
mkdir -p /config; chown "$PUID:$PGID" /config; chmod 750 /config
if [ -S /var/run/docker.sock ]; then SGID="$(stat -c %g /var/run/docker.sock)"; getent group "$SGID" >/dev/null 2>&1 || addgroup -g "$SGID" docker-socket; addgroup "$APP_USER" "$(getent group "$SGID"|cut -d: -f1)" 2>/dev/null || true; fi
umask "$UMASK"
exec su-exec "$APP_USER" "$@"
