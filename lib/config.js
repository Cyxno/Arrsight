import fs from 'node:fs/promises';
import path from 'node:path';

export const CONFIG_VERSION = 2;
export const integrations = ['sonarr','radarr','bazarr','plex','jellyfin','infinidysk','nzbdav'];
export const defaults = {
  configVersion: CONFIG_VERSION, productName: 'ArrSight', locale: 'en', port: 8090,
  managementMode: 'monitoring',
  sonarr:{enabled:false,displayName:'Sonarr',url:'http://sonarr:8989',externalUrl:'',apiKey:'',containerName:'sonarr'},
  radarr:{enabled:false,displayName:'Radarr',url:'http://radarr:7878',externalUrl:'',apiKey:'',containerName:'radarr'},
  bazarr:{enabled:false,displayName:'Bazarr',url:'http://bazarr:6767',externalUrl:'',apiKey:'',containerName:'bazarr'},
  plex:{enabled:false,displayName:'Plex',url:'http://plex:32400',externalUrl:'',apiKey:'',containerName:'plex'},
  jellyfin:{enabled:false,displayName:'Jellyfin',url:'http://jellyfin:8096',externalUrl:'',apiKey:'',containerName:'jellyfin'},
  infinidysk:{enabled:false,displayName:'InfiniDysk',url:'',externalUrl:'',apiKey:'',containerName:'infinidysk'},
  nzbdav:{enabled:false,displayName:'NZBDav',url:'http://nzbdav:3000',externalUrl:'',apiKey:'',containerName:'nzbdav'},
  monitoring:{dockerEnabled:false,mountsEnabled:false,sampleMinutes:5,retentionDays:90,resolvedHours:72,queueStaleMinutes:30,queueFailedMinutes:120,mountWarnMs:1500,mountTimeoutMs:5000},
  paths:{verifierLog:'/data/verifier.log',periodicLog:'/data/periodic-search.log',watchdogLog:'/data/watchdog.log',rcloneLog:'/data/rclone.log',bazarrLog:'/data/bazarr.log',actionDir:'actions',actionLog:'/data/actions.log',tvRoot:'/media/tv',movieRoot:'/media/movies',nzbdavMount:'/nzbdav'},
  dockerSocket:'/var/run/docker.sock', containers:[], links:{}
};

export function deepMerge(base, override) {
  const out={...base}; for (const [key,value] of Object.entries(override||{})) out[key]=value&&typeof value==='object'&&!Array.isArray(value)?deepMerge(base[key]||{},value):value; return out;
}
export function migrateConfig(input={}) {
  const old=input&&typeof input==='object'?input:{}; const migrated=deepMerge(defaults,old);
  migrated.configVersion=CONFIG_VERSION; migrated.productName='ArrSight'; migrated.locale=['en','nl'].includes(old.locale)?old.locale:'en';
  for (const name of integrations) if (old[name] && old[name].enabled === undefined) migrated[name].enabled=Boolean(old[name].url||old[name].apiKey);
  if (!old.managementMode) migrated.managementMode='monitoring';
  return migrated;
}
export function publicConfig(value) {
  const out=structuredClone(value); for(const name of integrations){ const secret=out[name]?.apiKey; if(out[name]){ delete out[name].apiKey; out[name].secretConfigured=Boolean(secret); }} return out;
}
export function applySecretUpdates(next, previous={}) { for(const name of integrations) if(!next[name]?.apiKey && previous[name]?.apiKey) next[name].apiKey=previous[name].apiKey; return next; }
export function validateConfig(value) {
  const errors=[]; if(!value||typeof value!=='object'||Array.isArray(value)) return ['invalid_config'];
  if(!['en','nl'].includes(value.locale)) errors.push('invalid_locale'); if(!['monitoring','containers','full'].includes(value.managementMode)) errors.push('invalid_management_mode');
  for(const name of integrations){ const row=value[name]; if(!row||typeof row!=='object') continue; for(const field of ['url','externalUrl']) if(row[field]){ try { const u=new URL(row[field]); if(!['http:','https:'].includes(u.protocol)||u.username||u.password) throw new Error(); } catch { errors.push(`invalid_url:${name}:${field}`); } } if(row.containerName&&!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(row.containerName)) errors.push(`invalid_container:${name}`); }
  return errors;
}
export function validateMountPath(candidate, category) { const roots={data:'/data',tv:'/media/tv',movies:'/media/movies',nzbdav:'/nzbdav'}; const root=roots[category]; if(!root||typeof candidate!=='string') return false; const normalized=path.posix.resolve(candidate.replaceAll('\\','/')); return normalized===root||normalized.startsWith(`${root}/`); }
export async function atomicWrite(file,value){ await fs.mkdir(path.dirname(file),{recursive:true}); const temp=`${file}.${process.pid}.${Date.now()}.tmp`; await fs.writeFile(temp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600}); await fs.chmod(temp,0o600); await fs.rename(temp,file); await fs.chmod(file,0o600); }
export async function migrateLegacyFiles(appDir,configDir,names=['config.json','metrics-history.json','incidents-history.json','usage-history.json']) { const moved=[]; await fs.mkdir(configDir,{recursive:true}); for(const name of names){ const from=path.join(appDir,name),to=path.join(configDir,name); try{ await fs.access(to); continue; }catch{} try{ await fs.copyFile(from,to); await fs.chmod(to,0o600); moved.push(name); }catch(error){ if(error.code!=='ENOENT') throw error; }} return moved; }
