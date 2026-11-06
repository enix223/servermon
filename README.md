# ServerMon

A desktop monitoring console for multiple Kubernetes clusters, built with Electron, React,
Tailwind CSS, and SQLite. Each cluster is polled at a configurable interval (5 seconds by
default) and gets its own tab; connections are managed from a built-in **Clusters** page.

The app is structured as a multi-module console:

- **Kubernetes** → Pods, Clusters
- **Alibaba Cloud** → ECS servers (layout placeholder; integration is planned)

## Highlights

- **Multiple clusters, one window** — a tab per cluster with live pod and issue counts.
- **Configurable real-time polling** — all clusters refresh in parallel (5 s default, adjustable in
  Settings), with pause and manual refresh. Polling continues on the Clusters page so connection
  indicators stay current.
- **Two authentication methods**
  - Kubeconfig file path (optional context), including exec-based credential plugins used by
    EKS, GKE, and AKS.
  - API server URL + bearer token (+ optional PEM CA bundle or skip-TLS-verification).
- **Cluster management in SQLite** — add, edit, test, and remove connections. Tokens stay in the
  main process and never cross the IPC boundary back to the renderer.
- **Ops-friendly pod table** — kubectl-style statuses (`CrashLoopBackOff`, `ImagePullBackOff`,
  `OOMKilled`, `ContainerCreating`, `Terminating`, `Completed`, …), ready and restart counts,
  node, pod IP, age, search/filter/sort.
- **Failure tolerant** — when a cluster becomes unreachable, the last successful snapshot stays
  visible with an error banner while ServerMon keeps retrying at the configured interval.
- **Kubernetes 1.29 – 1.35** — only stable `v1` core APIs (`GET /version`, `GET /api/v1/pods`) are
  used.
- **Web-ready boundaries** — pages depend on an injected data API interface; SQLite lives behind a
  repository port. Both can be swapped without touching the UI or the use-case layer.
- **In-app upgrades** — Settings → Application updates checks for a newer version, shows release
  notes and download progress, and can restart/install the update.
- **Configurable polling interval** — Settings → Monitoring controls the refresh interval for all
  clusters. It is persisted in the SQLite `settings` table.

## Requirements

- macOS (tested), Windows, or Linux for the desktop app.
- Node.js 20+ for development.
- Kubernetes credentials allowed to list pods cluster-wide. Example service account RBAC:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: servermon-pod-reader
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: servermon-pod-reader
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: servermon-pod-reader
subjects:
  - kind: ServiceAccount
    name: servermon
    namespace: default
```

## Development

```bash
npm install
npm run dev        # Electron + Vite with hot reload
npm run typecheck  # main/preload and renderer TypeScript checks
npm run build      # production build into out/
npm start          # run the production build
```

If the Electron binary was not downloaded by `npm install` (npm 11 can skip install scripts):

```bash
node node_modules/electron/install.js
# or, if GitHub is slow:
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js
```

Package a macOS app:

```bash
npm run dist       # electron-builder -> dist/
```

## Usage

1. Open **Kubernetes → Clusters → Add cluster**.
2. Choose an authentication method:
   - **Kubeconfig file** — path on this machine (e.g. `~/.kube/config`) and optionally a context.
   - **Bearer token** — API server URL (e.g. `https://10.0.0.10:6443`) plus a token. Paste a PEM CA
     bundle for private CAs, or enable **Skip TLS verification**. Plain `http://` endpoints
     require skip-TLS-verification (an upstream Kubernetes client policy).
3. **Test connection** verifies credentials and reports the server version, then save.
4. Switch to **Kubernetes → Pods**. All clusters are polled at the interval configured in
   Settings (5 seconds by default). Use the pause/play
   button for global auto-refresh, the refresh button to fetch immediately, or per-tab filters to
   narrow the pod table.
5. Editing or removing a connection only changes ServerMon's local configuration; the cluster is
   never modified.

## UI layering and the data API

The page layer never talks to Electron IPC, SQLite, or Kubernetes directly.

```
Pages / components
      │  useApi() → ServermonApi interface (src/shared/api.ts)
      ▼
ApiProvider (React context)
      │
      ▼
Adapter: createElectronApi() → preload → IPC → main process
         (future) createHttpApi() → Next.js route handlers
```

- **`src/shared/api.ts`** defines `ServermonApi`, the contract every page depends on.
- **`src/renderer/src/data/ApiContext.tsx`** injects the implementation via `<ApiProvider api={…}>`
  and exposes `useApi()`.
- **`src/renderer/src/data/electronApi.ts`** is the desktop adapter (Electron IPC). A web
  deployment adds an equivalent `fetch()` adapter and passes it to `ApiProvider`; pages do not
  change.
- The preload bridge exposes only this interface (`contextIsolation: true`,
  `nodeIntegration: false`).

Suggested REST mapping for the future web app:

| `ServermonApi` method | REST endpoint |
| --- | --- |
| `listClusters()` | `GET /api/clusters` |
| `createCluster(input)` | `POST /api/clusters` |
| `updateCluster(id, input)` | `PUT /api/clusters/:id` |
| `deleteCluster(id)` | `DELETE /api/clusters/:id` |
| `testCluster(input, id?)` | `POST /api/clusters/test` |
| `listPods(clusterId)` | `GET /api/clusters/:id/pods` |
| `getSettings()` | `GET /api/settings` |
| `updateSettings(settings)` | `PUT /api/settings` |
| `getUpdateState()` | `GET /api/updates` |
| `checkForUpdates()` | `POST /api/updates/check` |
| `getAppInfo()` | `GET /api/app` |

## Settings

**Settings → Monitoring** sets the global refresh interval (1–3600 seconds). The value is stored in
the SQLite `settings` table (key `refresh_interval_seconds`, default `5`) and is read through
`SettingsService` → `SettingsRepository` → `SqliteSettingsRepository`. Changing it updates polling
immediately and updates the `Live · Ns` indicator in the title bar.

## Application updates

Settings → Application updates exposes `checkForUpdates`, `downloadUpdate`, and `installUpdate`
(restart + install). The main process wraps **electron-updater** behind the `AppUpdater` port.

Update checks only work in packaged builds. In development the UI reports that updates are
unavailable instead of failing silently. To enable them:

1. Set `version` in `package.json` for each release.
2. Configure a publish provider in `electron-builder.yml` (generic HTTP or GitHub). If you use a
   generic feed, the generated `app-update.yml` is bundled automatically. Alternatively set
   `SERVERMON_UPDATE_URL` at runtime to a generic feed URL.
3. Run `npm run dist`; the macOS targets now include both `dmg` and `zip`, which electron-updater
   needs, plus update metadata.
4. Upload the artifacts (`dmg`, `zip`, `latest-mac.yml`, blockmaps) to the feed.
5. macOS automatic installation requires a **signed** app; unsigned builds can check/download but
   cannot install updates. Windows uses the NSIS installer; Linux packages use the corresponding
   electron-updater implementation.

The `AppUpdater` port has no SQL/IPC dependencies, so a web build can implement the same interface
with deployment-version information.

## Backend layers (ports and adapters)

```
src/main/
  domain/            Pure domain types, validation, draft merging, errors
  application/
    ports.ts         ClusterRepository + ClusterMonitor interfaces (the ports)
    clusterService.ts     CRUD use cases
    connectionTester.ts   "Test connection" use case
  infrastructure/
    sqliteDatabase.ts            open DB + run migrations
    sqliteClusterRepository.ts   ClusterRepository → SQLite
    kubernetesClusterMonitor.ts  ClusterMonitor → Kubernetes API
  ipc.ts             Transport adapter: IPC → application services
  index.ts           Composition root (the only place that wires concrete classes)
```

`ClusterService`, `ConnectionTester`, and `SettingsService` depend only on the interfaces in
`application/ports.ts`. `SqliteClusterRepository implements ClusterRepository` and
`SqliteSettingsRepository implements SettingsRepository`; `KubernetesClusterMonitor implements
ClusterMonitor`; `ElectronUpdater implements AppUpdater`. To move the backend to Postgres, add a
`PostgresClusterRepository` / `PostgresSettingsRepository` and swap them in the composition root —
no changes to domain logic, IPC, or UI. The same application/domain code can be hosted in Next.js
route handlers.

## Database and migrations

SQLite lives at Electron's per-user data directory:

- macOS: `~/Library/Application Support/ServerMon/servermon.db`
- Windows: `%APPDATA%/ServerMon/servermon.db`
- Linux: `~/.config/ServerMon/servermon.db`

Set `SERVERMON_USER_DATA=/some/dir` to override the location (useful for portable installs and
tests).

Startup runs forward-only migrations from `src/main/infrastructure/sqliteDatabase.ts`:

- A `schema_migrations` table records `version`, `name`, and `applied_at` for every applied
  migration.
- Pending migrations run in version order, each inside its own transaction. A failed migration is
  rolled back and retried on the next launch; earlier successful migrations remain recorded.
- Applied migrations must never be edited. Add a new entry with the next version:

```ts
{
  version: 3,
  name: 'create_aliyun_accounts',
  up: (db) => db.exec(`
    CREATE TABLE aliyun_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      access_key_id TEXT NOT NULL,
      access_key_secret TEXT NOT NULL,
      region TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
}
```

This is how table changes or new tables (for example the planned Aliyun module) are introduced
without breaking existing installs. The current `clusters` table:

```sql
CREATE TABLE clusters (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL COLLATE NOCASE UNIQUE,
  server             TEXT NOT NULL DEFAULT '',
  auth_type          TEXT NOT NULL CHECK (auth_type IN ('kubeconfig', 'token')),
  kubeconfig_path    TEXT,
  kubeconfig_context TEXT,
  token              TEXT,
  ca_cert            TEXT,
  skip_tls_verify    INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

Migrations shipped so far: `1` (clusters), `2` (settings, seeded with a 5-second refresh interval).

Bearer tokens are stored locally in SQLite. The file is restricted to the current user
(`chmod 600`) and tokens are never sent to the renderer, but the database is not encrypted. Treat
the app-data directory as sensitive. A web deployment should use a server-side secret store instead
of storing cloud credentials in the browser database.

## Styling

The renderer uses **Tailwind CSS v4** via `@tailwindcss/vite`:

- Design tokens (colors, radii, fonts, the `sidebar` breakpoint) live in the `@theme` block of
  `src/renderer/src/styles.css`.
- Layout and page structure use Tailwind utilities directly in JSX.
- Small, repeated primitives (`.btn`, `.icon-btn`, `.status-pill`, `.filter-chip`, inputs,
  modal, toasts) are declared in `@layer components` with `@apply`.
- Tailwind v4 needs no `tailwind.config.js`.

The sidebar collapses to icons below the `sidebar` breakpoint (1240 px); the pod table hides
lower-priority columns on narrower windows.

## Testing

```bash
npm run test:e2e
```

The test builds the app, starts a mock Kubernetes API, launches the real Electron app with an
isolated user-data directory, and verifies:

- adding a token-authenticated cluster and a kubeconfig-authenticated cluster,
- **Test connection** against both auth modes,
- pod status rendering, search, issue/completed filters,
- the configured auto-refresh (5 s default, by counting requests received by the mock API),
- responsive sidebar collapse,
- module navigation to the Alibaba Cloud placeholder page,
- editing and deleting clusters,
- the settings table (refresh interval persisted and reflected in the UI),
- the update-status UI (the update path reports as unavailable in unpackaged test builds),
- the `schema_migrations` history rows.

Screenshots are written to `screenshots/`.

## Project structure

```
src/
  main/
    domain/cluster.ts
    application/{ports,clusterService,connectionTester,settingsService}.ts
    infrastructure/{sqliteDatabase,sqliteClusterRepository,sqliteSettingsRepository}.ts
    infrastructure/{kubernetesClusterMonitor,electronUpdater}.ts
    ipc.ts
    index.ts
  preload/index.ts
  renderer/
    src/App.tsx
    src/data/{ApiContext,electronApi}.tsx|ts
    src/components/{Sidebar,TopBar,ClusterTabs,PodsView,PodTable,ConfigPage,ClusterForm,AliyunEcsPage,…}
    src/lib/{navigation,format,pods,ui}.ts
    src/styles.css
  shared/
    api.ts          ServermonApi contract used by pages
    types.ts        Domain DTOs shared across processes
scripts/
  mock-k8s-server.mjs
  e2e.mjs
```

## Notes and limitations

- Polling uses `list pods` on every interval rather than a watch/informer. That is deliberate for a
  dashboard interval and easy multi-version compatibility, but request volume scales with cluster
  count and size. Use pause to reduce load.
- Only bearer-token and kubeconfig authentication are supported; client-certificate auth works via
  kubeconfig.
- Pod CPU/memory usage is not shown because it requires metrics-server and the metrics API.
- The Alibaba Cloud ECS page is a layout placeholder only. It uses no credits, credentials, or
  Alibaba Cloud API calls yet.
- The status column derives from pod phase plus container waiting/terminated reasons; it aims to
  match `kubectl get pods`, not every pod condition.
