FROM node:20-alpine AS runtime
LABEL org.opencontainers.image.title="ArrSight" org.opencontainers.image.description="Media stack health, at a glance." org.opencontainers.image.source="https://github.com/Cyxno/arr-health-dashboard" org.opencontainers.image.url="https://github.com/Cyxno/arr-health-dashboard" org.opencontainers.image.licenses="MIT"
ARG VCS_REF="unknown" VERSION="1.1.0"
LABEL org.opencontainers.image.revision=$VCS_REF org.opencontainers.image.version=$VERSION
ENV NODE_ENV=production CONFIG_DIR=/config
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
RUN mkdir -p /config && chown node:node /config
USER node
EXPOSE 8090
VOLUME ["/config"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null || exit 1
STOPSIGNAL SIGTERM
CMD ["node","server.js"]
