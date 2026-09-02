# Arr Health Dashboard

Private source repository for the dashboard running at `http://192.168.1.2:8090/` on the Unraid homeserver.

The application combines a dependency-free Node.js backend with a static HTML/CSS/JavaScript frontend. It shows container state, Sonarr and Radarr health, InfiniDysk/WebDAV status, queues, log-derived signals, network usage and controlled maintenance actions.

## Repository contents

- `server.js`: HTTP server, live API aggregation and controlled action endpoints.
- `public/`: dashboard frontend and image assets.
- `config.example.json`: safe configuration template without credentials.
- `unraid/my-arr-health-dashboard.xml`: Unraid Docker template.

Runtime files are deliberately excluded from Git: `config.json`, API keys, usage history, logs, queued/completed actions, databases and backups.

## Run locally

1. Copy `config.example.json` to `config.json`.
2. Fill in the four API keys locally.
3. Make the paths in `server.js` or `config.json` match the host/container mounts.
4. Start with Node.js 20 or newer:

```bash
npm start
```

The default port is `8090`.

## Operational history and status rules

`metrics-history.json` stores only bounded operational counters and statuses (90 days by default), never media titles or raw logs. Writes use a temporary file plus atomic rename, are serialized, and a missing or malformed file starts as an empty history. Samples are collected every five minutes without overlapping background runs; both values are configurable under `monitoring`.

A queue can be non-empty and healthy: downloading is normal blue activity. Completed/import-pending items become degraded after 30 minutes without a usable completion signal and incidents after 120 minutes; explicit failed/error states are incidents immediately. Missing and cutoff totals are backlog information, with zero shown as healthy.

Log incidents expire instead of remaining active forever: provider/mount signals after one hour, import signals after two hours, missing/corrupt media after six hours and replacement limits after twelve hours. Successful repair/fallback automation is immediately resolved and remains visible in history. Lines without a parseable timestamp are historical because their recency cannot be established safely.

Mount checks perform a read-only directory listing with a hard timeout. Healthy, slow and timed-out/missing paths are distinguished; no writes are performed on media mounts.

## Deployment model

This is a live server application, not a static GitHub Pages site. The frontend calls `/api/snapshot` and `/api/action`, while the backend talks to LAN-only services and reads mounted logs and Docker state. GitHub stores the private source; the functional dashboard continues to run on Unraid.

## Security

Keep the repository private. Never commit `config.json` or runtime exports: dashboard snapshots and logs can contain internal hostnames, media titles and operational details.

Action names, Arr commands and restartable containers remain allowlisted server-side and concurrent management actions return HTTP 409. Deploy behind an authenticated, trusted reverse proxy when the dashboard is reachable outside a trusted LAN. A read-only Docker socket bindmount does not make Docker operations read-only at the API level.

