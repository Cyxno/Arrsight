FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY public /public
RUN npm run build

FROM node:20-alpine AS runtime
LABEL org.opencontainers.image.title="ArrSight" org.opencontainers.image.description="Media stack health, at a glance." org.opencontainers.image.source="https://github.com/Cyxno/arr-health-dashboard" org.opencontainers.image.url="https://github.com/Cyxno/arr-health-dashboard" org.opencontainers.image.licenses="MIT"
ARG VCS_REF="unknown" VERSION="1.2.0"
LABEL org.opencontainers.image.revision=$VCS_REF org.opencontainers.image.version=$VERSION
ENV NODE_ENV=production CONFIG_DIR=/config
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node lib ./lib
COPY --from=frontend --chown=node:node /build/dist ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN apk add --no-cache su-exec && chmod 755 /usr/local/bin/docker-entrypoint.sh && mkdir -p /config
EXPOSE 8090
VOLUME ["/config"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null || exit 1
STOPSIGNAL SIGTERM
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node","server.js"]
