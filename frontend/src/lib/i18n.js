// Localization catalogs, ported from the original public/locales.js and extended
// for the Svelte frontend. Keep `en` and `nl` key sets identical (locales.test.js).
export const en = {
  language: 'Language', theme: 'Color theme', system: 'System', light: 'Light', dark: 'Dark',
  refresh: 'Refresh', loading: 'Loading', updated: 'Updated', settings: 'Settings', save: 'Save settings',
  saved: 'Settings saved', setup: 'Setup', nav: 'Dashboard sections',
  overview: 'Overview', downloads: 'Downloads', providers: 'Providers', media: 'Media', incidents: 'Incidents', system: 'System', logs: 'Logs',
  healthy: 'Healthy', degraded: 'Degraded', incident: 'Incident', unknown: 'Unknown',
  active: 'Active', resolved: 'Resolved', historical: 'Historical', unavailable: 'Unavailable',
  generalStatus: 'Overall status', activeSignals: '{count} active signals', queueItems: 'Queue items', normalActivity: 'Normal activity', queueEmpty: 'Queue is empty',
  noAdvice: 'No advice', unknownSource: 'Unknown source', last: 'last {time}', noActiveIncidents: 'No active incidents', noItems: 'No items',
  pipelineClear: 'The pipeline has no active log-derived outage.', clear: 'Clear',
  historyBuilding: 'History is being collected', historyPeriod: '24 hours · {count} samples in 7 days', historyMeta: 'Every {minutes} min · {days} days retention',
  queueSummary: '{active} active · {stalled} stalled · oldest {minutes} min', sourceUnavailable: 'Source unavailable', noBacklog: 'No backlog', backlogAgeUnknown: 'Monitored backlog; age unavailable',
  providerEmpty: 'No provider data', providerEmptyHelp: 'Providers appear only when reliable log data is available.',
  providerSummary: '{trips} trips · {missing} missing articles · {period} · last trip {trip} · recovery {recovery}',
  noProviderIncidents: 'No active provider incidents', noRecentProvider: 'No recent trips, timeouts, or missing-article warnings.',
  noContainers: 'No container data', noContainersHelp: 'Docker is unavailable or no containers are configured.',
  apiChecked: 'HTTP {status} · checked {time}', readPassed: 'Read test passed',
  actionRunning: 'Action is running…', started: 'Started', failed: 'Failed', close: 'Close',
  login: 'Log in', logout: 'Log out', adminPassword: 'Administrator password', setupCode: 'Temporary setup code from the container log', continue: 'Continue', back: 'Back',
  welcome: 'Welcome to ArrSight', selectIntegrations: 'Select integrations', configureServices: 'Configure services and API access', configurePaths: 'Configure containers and mounted paths',
  testConnections: 'Test connections', choosePermissions: 'Choose management permissions', reviewConfiguration: 'Review configuration', saveOpen: 'Save and open the dashboard',
  displayName: 'Display name', internalUrl: 'Internal URL', externalUrl: 'External dashboard URL (optional)', apiSecret: 'API key or token', containerName: 'Docker container name (optional)',
  configuredSecret: 'Configured — leave blank to keep', test: 'Test', optionalFeatures: 'Optional monitoring sources',
  dockerMonitoring: 'Docker container monitoring', mountMonitoring: 'Filesystem mount monitoring', verifierLogs: 'Verifier logs', watchdogLogs: 'Watchdog logs', periodicLogs: 'Periodic-search logs',
  requiredField: 'This field is required.', invalidUrl: 'Enter a valid HTTP or HTTPS URL.', passwordHelp: 'Use at least 10 characters.',
  volumeHelp: 'Bind mounts cannot be created inside ArrSight. Map host folders to /data, /media/tv, /media/movies and /nzbdav. ArrSight only performs read tests.',
  monitoringOnly: 'Monitoring only', containerManagement: 'Monitoring and container management', fullManagement: 'Full management',
  socketWarning: 'The Docker socket grants powerful Docker access, even when mounted read-only.', noIntegrations: 'No integrations selected; this is supported.',
  pathReadable: 'Path is readable.', pathUnreadable: 'Path is unavailable or not allowed.', authenticationRequired: 'Administrator login required.',
  now: 'Now', decisionOverview: 'Decision overview', recommendedNext: 'Recommended next step', assessing: 'Assessing status', loadingSnapshot: 'Loading snapshot…',
  priority: 'Priority', causeEffect: 'Cause → effect', mediaPipeline: 'Media pipeline', periodHeading: '24 hours & 7 days', keyTrends: 'Key trends', details: 'Details',
  downloadIntro: 'Queues, backlog, recovery actions, and download trends.', activity: 'Activity', queues: 'Queues', backlog: 'Backlog', wanted: 'Wanted & cutoff unmet',
  automation: 'Automation', repairsSearches: 'Repairs & periodic searches', history: 'History', queueTrends: 'Queue and download trends',
  providerIntro: 'Only measured or reliably inferred provider data.', derivedLogs: 'Derived from logs', providerTrends: 'Provider trends',
  technology: 'Technology', systemIntro: 'Containers, APIs, mounts, usage, logs, and management.', containers: 'Containers', reachability: 'Reachability', apiMounts: 'APIs & mount checks',
  dataUsage: 'Data usage', logsTechnical: 'Logs and technical details', logSource: 'Log source', actions: 'Actions', exportSnapshot: 'Export snapshot',
  serviceActions: 'Service links and manual actions', proxyWarning: 'Protect this dashboard with a trusted reverse proxy; a read-only Docker socket bind mount is not an authorization boundary.', ready: 'Ready',
  noPaths: 'No mounted paths are needed for the selected features.', error: 'Error', queueActivity: 'Queue activity', problemScore: 'Problem score', mountLatency: 'Mount latency',
  providerHistoryInsufficient: 'Not enough reliable provider history for a trend yet.',
  today: 'Today', week: 'Week', month: 'Month', year: 'Year', dashboardTotal: 'Dashboard total', traffic: 'in {incoming} · out {outgoing}',
  runVerifier: 'Run verifier', runPeriodic: 'Run periodic search', runMountCheck: 'Run mount check', restart: 'Restart {name}', confirmManagement: 'Run this management action?',
  queueDetails: 'Queue details', mountReadTests: 'Mount read tests', repairs: 'Repairs', statusDetails: 'Status details', noHealthcheck: 'no health check',
  disabled: 'Not configured', notConfigured: 'Not configured', backToOverview: 'ArrSight — back to overview',
  autoRefresh: 'Auto-refresh', autoRefreshMeta: 'every {seconds} s', attention: 'Needs attention', allClear: 'All components are healthy.', lastMeasurement: 'Last measurement',
  loginTitle: 'Sign in to ArrSight', loginHelp: 'Enter the administrator password to open the dashboard.',
  invalidCredentials: 'Incorrect password.', rateLimited: 'Too many attempts — wait a minute and try again.', sessionExpired: 'Your session expired. Sign in again.', networkError: 'Server unreachable.',
  refreshing: 'Refreshing…', firstSeen: 'First seen', lastSeen: 'Last seen', occurrences: '{count} occurrences', advice: 'Advice',
  latency: 'Latency', consecutiveFailures: '{count} consecutive failures', lastKnownGood: 'Last success', lastFailure: 'Last failure',
  progress: 'Progress', eta: 'ETA', age: 'Age', itemTitle: 'Title', state: 'State', phase: 'Phase',
  trips: 'Trips', missingArticles: 'Missing articles', lastTrip: 'Last trip', lastRecovery: 'Last recovery',
  clean: 'Clean', succeeded: 'With repairs', incomplete: 'Incomplete', running: 'Running',
  logVerifier: 'Verifier', logPeriodic: 'Periodic search', logWatchdog: 'Watchdog', logNzbdav: 'InfiniDysk', logBazarr: 'Bazarr', noLogLines: 'No log lines in this source.',
  general: 'General', monitoring: 'Monitoring', paths: 'Paths', management: 'Management', serviceLinks: 'Service links', addLink: 'Add link', removeLink: 'Remove',
  linkName: 'Name', containersList: 'Monitored containers', addContainer: 'Add container', sampleInterval: 'Sample interval (minutes)', retention: 'Retention (days)',
  resolvedWindow: 'Resolved window (hours)', queueStale: 'Queue stale threshold (minutes)', queueFailed: 'Queue failed threshold (minutes)',
  mountWarn: 'Mount warn threshold (ms)', mountTimeout: 'Mount timeout (ms)', managementMode: 'Management mode', dockerSocketLabel: 'Docker socket path',
  saving: 'Saving…', validationFailed: 'Please fix the marked fields.', setupMode: 'First-time setup',
  setupIntro: 'ArrSight is not configured yet. The temporary setup code is printed to the container log on startup.',
  webdavMount: 'WebDAV mount', apis: 'APIs', playback: 'Playback & library', subtitles: 'Subtitles', currentActivity: 'Current activity',
  recentProblems: 'Recent problems', uniqueProblems: 'Unique problems', noData: 'No data yet.', pipelineHelp: 'Click a stage for details.',
  restarts: 'Restarts', restartIncreased: 'Restarted unexpectedly', skipped: 'Skipped runs', backoffs: 'Blocklist backoffs',
  searchEvents: 'Search events', verifierRuns: 'Verifier runs', repairsPerformed: '{count} repairs', streamChecks: '{count} stream checks',
  step: 'Step', of: 'of', openDashboard: 'Open dashboard', setupSaved: 'Setup complete. Sign in with your new administrator password.',
  management_disabled: 'Management actions are disabled in monitoring-only mode.',
  action_in_progress: 'Another management action is still running.',
  invalid_action: 'Unknown or invalid action.',
  container_not_allowed: 'This container is not in the configured allowlist.',
  full_management_required: 'Full management mode is required for this action.',
  resolvedAdvice: 'The problem is no longer active.',
  'chain.arr': 'Sonarr / Radarr', 'chain.provider': 'Usenet providers', 'chain.infinidysk': 'Download client', 'chain.mount': 'WebDAV mount', 'chain.library': 'Import / library', 'chain.bazarr': 'Bazarr', 'chain.plex': 'Plex container',
  'attention.provider-trip.title': 'Provider trip / timeout',
  'attention.provider-trip.advice': 'Watch provider timeouts and trips. If these accumulate, lower the connection count or temporarily disable the provider.',
  'attention.single-provider.title': 'Only one provider used',
  'attention.single-provider.advice': 'The fallback is not being used or is ineligible. Check provider settings if missing articles keep increasing.',
  'attention.missing-articles.title': 'Missing articles / DMCA',
  'attention.missing-articles.advice': 'This is normal after takedowns. Investigate if the same title recurs or no 1080p fallback is selected.',
  'attention.repair-action.title': 'Repair / blocklist action',
  'attention.repair-action.advice': 'This is usually expected: the broken release is removed or blocklisted and searched again.',
  'attention.import-stuck.title': 'Import stuck',
  'attention.import-stuck.advice': 'Completed/importPending or sample detection is stuck. Periodic cleanup should remove it and search again.',
  'attention.fallback-rescue.title': 'Recent missing rescue',
  'attention.fallback-rescue.advice': 'The fallback rescue steps in for recent missing episodes and picks a lower or alternative release.',
  'attention.search-limit.title': 'Replacement limit reached',
  'attention.search-limit.advice': 'Too many broken releases were attempted. Check whether acceptable 720p/1080p releases remain available.',
  'attention.mount-watchdog.title': 'Mount/watchdog recovery',
  'attention.mount-watchdog.advice': 'The mount was stale or missing, or containers could not see it. Tighten rclone or watchdog checks if this recurs.',
  'attention.corrupt-media.title': 'Corrupt or unreadable media',
  'attention.corrupt-media.advice': 'The file is not reliably playable. The repair or verifier job should remove it and search again.',
  'attention.queue-busy.title': 'Queue/backlog busy',
  'attention.queue-busy.advice': 'Scripts pause heavier checks while the download client is busy. Expected behavior, but prolonged busyness deserves attention.',
  'attention.queue-failed.advice': 'Open the queue details and repair or remove the failed item.',
  'attention.queue-stalled.advice': 'Check progress and import status.',
  'attention.container-state.advice': 'Check container status and logs; restart only when safe.',
  'attention.container-restart.advice': 'Check container logs around the restart time.',
  'attention.docker-unreachable.advice': 'Check the Docker socket and dashboard permissions.',
  'attention.api-unreachable.advice': 'Check the container, network, and API configuration.',
  'attention.mount-read-check.advice': 'Check the download-client mount, then run the mount check.',
  'attention.verifier-failed.advice': 'Check the verifier log and fix the cause before starting another run.',
  'attention.verifier-incomplete.advice': 'Check why the earlier verifier run did not finish cleanly.'
};
export const nl = {
  language: 'Taal', theme: 'Kleurthema', system: 'Systeem', light: 'Licht', dark: 'Donker',
  refresh: 'Vernieuwen', loading: 'Laden', updated: 'Bijgewerkt', settings: 'Instellingen', save: 'Instellingen opslaan',
  saved: 'Instellingen opgeslagen', setup: 'Installatie', nav: 'Dashboardonderdelen',
  overview: 'Overzicht', downloads: 'Downloads', providers: 'Providers', media: 'Media', incidents: 'Incidenten', system: 'Systeem', logs: 'Logs',
  healthy: 'Gezond', degraded: 'Verminderd', incident: 'Incident', unknown: 'Onbekend',
  active: 'Actief', resolved: 'Opgelost', historical: 'Historisch', unavailable: 'Niet beschikbaar',
  generalStatus: 'Algemene status', activeSignals: '{count} actieve signalen', queueItems: 'Wachtrij-items', normalActivity: 'Normale activiteit', queueEmpty: 'Wachtrij is leeg',
  noAdvice: 'Geen advies', unknownSource: 'Onbekende bron', last: 'laatst {time}', noActiveIncidents: 'Geen actieve incidenten', noItems: 'Geen items',
  pipelineClear: 'De keten heeft geen actieve, uit logs afgeleide storing.', clear: 'Rustig',
  historyBuilding: 'Historie wordt opgebouwd', historyPeriod: '24 uur · {count} metingen in 7 dagen', historyMeta: 'Elke {minutes} min · {days} dagen retentie',
  queueSummary: '{active} actief · {stalled} vastgelopen · oudste {minutes} min', sourceUnavailable: 'Bron niet beschikbaar', noBacklog: 'Geen achterstand', backlogAgeUnknown: 'Bewaakte achterstand; leeftijd niet beschikbaar',
  providerEmpty: 'Geen providergegevens', providerEmptyHelp: 'Providers verschijnen alleen als betrouwbare loggegevens beschikbaar zijn.',
  providerSummary: '{trips} onderbrekingen · {missing} ontbrekende artikelen · {period} · laatste onderbreking {trip} · herstel {recovery}',
  noProviderIncidents: 'Geen actieve providerincidenten', noRecentProvider: 'Geen recente onderbrekingen, time-outs of waarschuwingen voor ontbrekende artikelen.',
  noContainers: 'Geen containergegevens', noContainersHelp: 'Docker is niet beschikbaar of er zijn geen containers geconfigureerd.',
  apiChecked: 'HTTP {status} · gecontroleerd {time}', readPassed: 'Leestest geslaagd',
  actionRunning: 'Actie wordt uitgevoerd…', started: 'Gestart', failed: 'Mislukt', close: 'Sluiten',
  login: 'Inloggen', logout: 'Uitloggen', adminPassword: 'Beheerderswachtwoord', setupCode: 'Tijdelijke setupcode uit het containerlog', continue: 'Verder', back: 'Terug',
  welcome: 'Welkom bij ArrSight', selectIntegrations: 'Selecteer integraties', configureServices: 'Configureer services en API-toegang', configurePaths: 'Configureer containers en gekoppelde paden',
  testConnections: 'Test verbindingen', choosePermissions: 'Kies beheerrechten', reviewConfiguration: 'Controleer configuratie', saveOpen: 'Opslaan en dashboard openen',
  displayName: 'Weergavenaam', internalUrl: 'Interne URL', externalUrl: 'Externe dashboard-URL (optioneel)', apiSecret: 'API-sleutel of token', containerName: 'Docker-containernaam (optioneel)',
  configuredSecret: 'Ingesteld — laat leeg om te behouden', test: 'Testen', optionalFeatures: 'Optionele bewakingsbronnen',
  dockerMonitoring: 'Docker-containerbewaking', mountMonitoring: 'Bestandssysteemkoppelingen bewaken', verifierLogs: 'Verifierlogs', watchdogLogs: 'Watchdoglogs', periodicLogs: 'Periodieke-zoeklogs',
  requiredField: 'Dit veld is verplicht.', invalidUrl: 'Voer een geldige HTTP- of HTTPS-URL in.', passwordHelp: 'Gebruik minstens 10 tekens.',
  volumeHelp: 'Bindmounts kunnen niet vanuit ArrSight worden gemaakt. Koppel hostmappen aan /data, /media/tv, /media/movies en /nzbdav. ArrSight voert alleen leestests uit.',
  monitoringOnly: 'Alleen bewaken', containerManagement: 'Bewaken en containerbeheer', fullManagement: 'Volledig beheer',
  socketWarning: 'De Docker-socket geeft krachtige toegang, ook bij een alleen-lezenkoppeling.', noIntegrations: 'Geen integraties geselecteerd; dit wordt ondersteund.',
  pathReadable: 'Pad is leesbaar.', pathUnreadable: 'Pad is niet beschikbaar of niet toegestaan.', authenticationRequired: 'Beheerdersaanmelding vereist.',
  now: 'Nu', decisionOverview: 'Beslissingsoverzicht', recommendedNext: 'Aanbevolen vervolgstap', assessing: 'Status wordt beoordeeld', loadingSnapshot: 'Momentopname laden…',
  priority: 'Prioriteit', causeEffect: 'Oorzaak → gevolg', mediaPipeline: 'Mediaketen', periodHeading: '24 uur & 7 dagen', keyTrends: 'Belangrijkste trends', details: 'Details',
  downloadIntro: 'Wachtrijen, achterstand, herstelacties en downloadtrends.', activity: 'Activiteit', queues: 'Wachtrijen', backlog: 'Achterstand', wanted: 'Gezocht & kwaliteitsgrens niet bereikt',
  automation: 'Automatisering', repairsSearches: 'Herstelacties & periodieke zoekopdrachten', history: 'Historie', queueTrends: 'Wachtrij- en downloadtrends',
  providerIntro: 'Alleen gemeten of betrouwbaar afgeleide providergegevens.', derivedLogs: 'Afgeleid uit logs', providerTrends: 'Providertrends',
  technology: 'Techniek', systemIntro: 'Containers, API’s, koppelingen, gebruik, logs en beheer.', containers: 'Containers', reachability: 'Bereikbaarheid', apiMounts: 'API’s & koppelingscontroles',
  dataUsage: 'Dataverbruik', logsTechnical: 'Logs en technische details', logSource: 'Logbron', actions: 'Acties', exportSnapshot: 'Momentopname exporteren',
  serviceActions: 'Servicelinks en handmatige acties', proxyWarning: 'Bescherm dit dashboard met een vertrouwde reverse proxy; een alleen-lezen Docker-socketkoppeling is geen autorisatiegrens.', ready: 'Gereed',
  noPaths: 'Voor de geselecteerde functies zijn geen gekoppelde paden nodig.', error: 'Fout', queueActivity: 'Wachtrijactiviteit', problemScore: 'Probleemscore', mountLatency: 'Koppelingslatentie',
  providerHistoryInsufficient: 'Er is nog onvoldoende betrouwbare providerhistorie voor een trend.',
  today: 'Vandaag', week: 'Week', month: 'Maand', year: 'Jaar', dashboardTotal: 'Dashboardtotaal', traffic: 'in {incoming} · uit {outgoing}',
  runVerifier: 'Verifier uitvoeren', runPeriodic: 'Periodieke zoekactie uitvoeren', runMountCheck: 'Koppelingscontrole uitvoeren', restart: '{name} herstarten', confirmManagement: 'Deze beheeractie uitvoeren?',
  queueDetails: 'Wachtrijdetails', mountReadTests: 'Leestests van koppelingen', repairs: 'Herstelacties', statusDetails: 'Statusdetails', noHealthcheck: 'geen statuscontrole',
  disabled: 'Niet geconfigureerd', notConfigured: 'Niet geconfigureerd', backToOverview: 'ArrSight — terug naar het overzicht',
  autoRefresh: 'Auto-vernieuwen', autoRefreshMeta: 'elke {seconds} s', attention: 'Aandacht vereist', allClear: 'Alle componenten zijn gezond.', lastMeasurement: 'Laatste meting',
  loginTitle: 'Aanmelden bij ArrSight', loginHelp: 'Voer het beheerderswachtwoord in om het dashboard te openen.',
  invalidCredentials: 'Onjuist wachtwoord.', rateLimited: 'Te veel pogingen — wacht een minuut en probeer het opnieuw.', sessionExpired: 'Uw sessie is verlopen. Meld opnieuw aan.', networkError: 'Server onbereikbaar.',
  refreshing: 'Vernieuwen…', firstSeen: 'Eerst gezien', lastSeen: 'Laatst gezien', occurrences: '{count} keer gezien', advice: 'Advies',
  latency: 'Latentie', consecutiveFailures: '{count} opeenvolgende fouten', lastKnownGood: 'Laatst geslaagd', lastFailure: 'Laatste fout',
  progress: 'Voortgang', eta: 'ETA', age: 'Leeftijd', itemTitle: 'Titel', state: 'Status', phase: 'Fase',
  trips: 'Onderbrekingen', missingArticles: 'Ontbrekende artikelen', lastTrip: 'Laatste onderbreking', lastRecovery: 'Laatste herstel',
  clean: 'Schoon', succeeded: 'Met herstel', incomplete: 'Onvolledig', running: 'Bezig',
  logVerifier: 'Verifier', logPeriodic: 'Periodieke zoekactie', logWatchdog: 'Watchdog', logNzbdav: 'InfiniDysk', logBazarr: 'Bazarr', noLogLines: 'Geen logregels in deze bron.',
  general: 'Algemeen', monitoring: 'Bewaking', paths: 'Paden', management: 'Beheer', serviceLinks: 'Servicelinks', addLink: 'Link toevoegen', removeLink: 'Verwijderen',
  linkName: 'Naam', containersList: 'Bewaakte containers', addContainer: 'Container toevoegen', sampleInterval: 'Meetinterval (minuten)', retention: 'Retentie (dagen)',
  resolvedWindow: 'Opgelost-venster (uren)', queueStale: 'Wachtrij-vervalgrens (minuten)', queueFailed: 'Wachtrij-foutgrens (minuten)',
  mountWarn: 'Koppelings-waarschuwingsgrens (ms)', mountTimeout: 'Koppelingstime-out (ms)', managementMode: 'Beheermodus', dockerSocketLabel: 'Docker-socketpad',
  saving: 'Opslaan…', validationFailed: 'Corrigeer de gemarkeerde velden.', setupMode: 'Eerste installatie',
  setupIntro: 'ArrSight is nog niet geconfigureerd. De tijdelijke setupcode wordt bij het starten naar het containerlog gedrukt.',
  webdavMount: 'WebDAV-koppeling', apis: 'API’s', playback: 'Afspelen & bibliotheek', subtitles: 'Ondertitels', currentActivity: 'Huidige activiteit',
  recentProblems: 'Recente problemen', uniqueProblems: 'Unieke problemen', noData: 'Nog geen gegevens.', pipelineHelp: 'Klik op een schakel voor details.',
  restarts: 'Herstarts', restartIncreased: 'Onverwacht herstart', skipped: 'Overgeslagen runs', backoffs: 'Blocklist-terugdringingen',
  searchEvents: 'Zoekgebeurtenissen', verifierRuns: 'Verifier-runs', repairsPerformed: '{count} herstelacties', streamChecks: '{count} streamcontroles',
  step: 'Stap', of: 'van', openDashboard: 'Dashboard openen', setupSaved: 'Installatie voltooid. Meld aan met uw nieuwe beheerderswachtwoord.',
  management_disabled: 'Beheeracties zijn uitgeschakeld in de bewakingsmodus.',
  action_in_progress: 'Er draait nog een andere beheeractie.',
  invalid_action: 'Onbekende of ongeldige actie.',
  container_not_allowed: 'Deze container staat niet in de geconfigureerde toestaande lijst.',
  full_management_required: 'Voor deze actie is de volledige beheermodus vereist.',
  resolvedAdvice: 'Het probleem is niet meer actief.',
  'chain.arr': 'Sonarr / Radarr', 'chain.provider': 'Usenet-providers', 'chain.infinidysk': 'Downloadclient', 'chain.mount': 'WebDAV-koppeling', 'chain.library': 'Import / bibliotheek', 'chain.bazarr': 'Bazarr', 'chain.plex': 'Plex-container',
  'attention.provider-trip.title': 'Providerstoring / time-out',
  'attention.provider-trip.advice': 'Houd provider-time-outs en storingen in de gaten. Als deze oplopen: verlaag het aantal verbindingen of schakel de provider tijdelijk uit.',
  'attention.single-provider.title': 'Maar één provider in gebruik',
  'attention.single-provider.advice': 'De fallback wordt niet gebruikt of is niet geschikt. Controleer de providerinstellingen als ontbrekende artikelen blijven oplopen.',
  'attention.missing-articles.title': 'Ontbrekende artikelen / DMCA',
  'attention.missing-articles.advice': 'Dit is normaal na takedowns. Onderzoek het als dezelfde titel terugkeert of geen 1080p-fallback wordt gekozen.',
  'attention.repair-action.title': 'Herstel- / blocklistactie',
  'attention.repair-action.advice': 'Dit is meestal verwacht: de kapotte release wordt verwijderd of geblacklist en opnieuw gezocht.',
  'attention.import-stuck.title': 'Import blijft hangen',
  'attention.import-stuck.advice': 'Completed/importPending of sample-detectie loopt vast. Periodieke schoonmaak hoort dit te verwijderen en opnieuw te zoeken.',
  'attention.fallback-rescue.title': 'Rescue voor recente ontbrekende afleveringen',
  'attention.fallback-rescue.advice': 'De fallback-rescue grijpt in voor recente ontbrekende afleveringen en kiest een lagere of andere release.',
  'attention.search-limit.title': 'Vervangingslimiet bereikt',
  'attention.search-limit.advice': 'Er zijn te veel kapotte releases geprobeerd. Controleer of er nog acceptabele 720p/1080p-releases beschikbaar zijn.',
  'attention.mount-watchdog.title': 'Mount-/watchdog-herstel',
  'attention.mount-watchdog.advice': 'De koppeling was verouderd of afwezig, of containers konden hem niet zien. Verstevig rclone- of watchdogcontroles als dit vaker gebeurt.',
  'attention.corrupt-media.title': 'Corrupte of onleesbare media',
  'attention.corrupt-media.advice': 'Het bestand is niet betrouwbaar afspeelbaar. De herstel- of verifiertaak hoort het te verwijderen en opnieuw te zoeken.',
  'attention.queue-busy.title': 'Wachtrij/achterstand druk',
  'attention.queue-busy.advice': 'Scripts pauzeren zwaardere checks terwijl de downloadclient druk is. Normaal gedrag, maar langdurige drukte is verdacht.',
  'attention.queue-failed.advice': 'Open de wachtrijdetails en herstel of verwijder het mislukte item.',
  'attention.queue-stalled.advice': 'Controleer de voortgang en de importstatus.',
  'attention.container-state.advice': 'Controleer de containerstatus en logs; herstart alleen als dat veilig is.',
  'attention.container-restart.advice': 'Controleer de containerlogs rond het herstartmoment.',
  'attention.docker-unreachable.advice': 'Controleer de Docker-socket en de rechten van het dashboard.',
  'attention.api-unreachable.advice': 'Controleer de container, het netwerk en de API-configuratie.',
  'attention.mount-read-check.advice': 'Controleer de koppeling van de downloadclient en voer daarna de koppelingscontrole uit.',
  'attention.verifier-failed.advice': 'Controleer het verifierlog en los de oorzaak op voordat u een nieuwe run start.',
  'attention.verifier-incomplete.advice': 'Controleer waarom de eerdere verifier-run niet correct is afgerond.'
};
export const dictionaries = { en, nl };

const storage = () => typeof localStorage === 'undefined' ? null : localStorage;
const browserLanguage = () => typeof navigator === 'undefined' ? 'en' : navigator.language || 'en';

export function initialLocale() {
  const saved = storage()?.getItem('arrsight-locale');
  return saved || (browserLanguage().toLowerCase().startsWith('nl') ? 'nl' : 'en');
}

let current = initialLocale();
const listeners = new Set();

export const locale = {
  subscribe(listener) {
    listener(current);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};

function setCurrent(value) {
  current = value === 'nl' ? 'nl' : 'en';
  for (const listener of listeners) listener(current);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
    document.dispatchEvent(new CustomEvent('arrsight:locale', { detail: current }));
  }
  return current;
}

export function setLocale(value, persist = true) {
  const applied = setCurrent(value);
  if (persist) storage()?.setItem('arrsight-locale', applied);
  return applied;
}

export function getLocale() { return current; }
export function localeCode() { return current === 'nl' ? 'nl-NL' : 'en-GB'; }

export function t(key, vars = {}) {
  let text = tf(key, key);
  for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

// Translate with an explicit fallback (used for server-provided text that is
// already readable but has no catalog entry).
export function tf(key, fallback) {
  return dictionaries[current]?.[key] ?? en[key] ?? fallback;
}
