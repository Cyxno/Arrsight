import fs from 'node:fs/promises';
import path from 'node:path';
import { defaults as defaultConfig, migrateConfig, migrateLegacyFiles } from './config.js';
import { sessionStore, newSetupCode, cookieValue } from './auth.js';
import { createHistoryStores } from './history.js';
import { createDockerService } from './docker.js';
import { createSnapshotService } from './snapshot.js';

// Owns ArrSight's mutable runtime state (configuration, setup code, sessions)
// and wires the service instances the route modules share.
export async function createRuntime({ appDir, configDir }) {
  const paths = {
    configPath: path.join(configDir, 'config.json'),
    usageHistoryPath: path.join(configDir, 'usage-history.json'),
    metricsHistoryPath: path.join(configDir, 'metrics-history.json'),
    incidentHistoryPath: path.join(configDir, 'incidents-history.json')
  };

  let config = defaultConfig;
  let configured = false;
  let setup = { code: null, expiresAt: 0 };
  const sessions = sessionStore();
  const failedLogins = new Map();
  const history = createHistoryStores(paths);
  const docker = createDockerService(() => config);
  const snapshot = createSnapshotService({ getConfig: () => config, docker, history, paths });

  const runtime = {
    paths, sessions, failedLogins, history, docker, snapshot,
    getConfig: () => config,
    isConfigured: () => configured,
    adminReady: () => Boolean(config.admin?.passwordHash),
    isAuthenticated: (req) => sessions.valid(cookieValue(req.headers.cookie)),
    setupState: () => setup,
    applyConfig(next) {
      config = next;
      configured = true;
      setup = { code: null, expiresAt: 0 };
    }
  };

  async function loadConfig() {
    const migratedFiles = await migrateLegacyFiles(appDir, configDir);
    if (migratedFiles.length) console.log(`Migrated runtime files to ${configDir}: ${migratedFiles.join(', ')}`);
    try {
      const raw = await fs.readFile(paths.configPath, 'utf8');
      config = migrateConfig(JSON.parse(raw));
      configured = true;
      if (!config.admin?.passwordHash) {
        setup = newSetupCode();
        console.log(`ArrSight administrator upgrade code (valid for 30 minutes): ${setup.code}`);
      }
    } catch {
      config = structuredClone(defaultConfig);
      configured = false;
      setup = newSetupCode();
      console.log(`ArrSight first-run setup code (valid for 30 minutes): ${setup.code}`);
    }
    if (process.env.PORT) config.port = Number(process.env.PORT) || config.port;
  }

  runtime.loadConfig = loadConfig;
  return runtime;
}
