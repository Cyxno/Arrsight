# Security policy

ArrSight is a self-hosted dashboard intended to run on a trusted home network.

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
**private security advisory** feature (Security → Advisories → New draft
security advisory) so details stay confidential until a fix is released.

## Supported versions

Only the latest release receives security fixes.

## Deployment expectations

- Run ArrSight on a trusted LAN or behind an authenticated reverse proxy.
  The dashboard controls your media stack and (optionally) your Docker
  daemon; anyone with ArrSight admin access has that reach.
- **Docker socket:** mounting `/var/run/docker.sock` grants powerful,
  effectively root-equivalent access to the host — even read-only. ArrSight
  only issues container inspect calls and restarts for explicitly configured
  containers, but mount the socket only when you need container monitoring
  or management.
- **Setup window:** before an administrator password exists, the setup
  endpoints accept requests from the same origin with the one-time setup
  code printed to the container log. Keep container logs private.
- **HTTPS:** when a reverse proxy terminates TLS, set
  `ARRSIGHT_TRUST_PROXY=true` so session cookies are marked `Secure`.
  Without it, `X-Forwarded-Proto` is ignored.
- **Usenet provider names** may be referenced in log-derived incident text;
  self-hosters configure their own integrations, so review your public
  screenshots and configuration before sharing them.
