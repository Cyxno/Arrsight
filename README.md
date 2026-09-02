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

## Deployment model

This is a live server application, not a static GitHub Pages site. The frontend calls `/api/snapshot` and `/api/action`, while the backend talks to LAN-only services and reads mounted logs and Docker state. GitHub stores the private source; the functional dashboard continues to run on Unraid.

## Security

Keep the repository private. Never commit `config.json` or runtime exports: dashboard snapshots and logs can contain internal hostnames, media titles and operational details.

