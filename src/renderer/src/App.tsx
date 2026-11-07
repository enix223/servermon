import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppInfo, AppSettings, ClusterRecord, PodsResult } from '@shared/types'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { ClusterTabs } from './components/ClusterTabs'
import { PodsView } from './components/PodsView'
import { ConfigPage } from './components/ConfigPage'
import { EcsProfileTabs } from './components/EcsProfileTabs'
import { EcsInstancesView } from './components/EcsInstancesView'
import { EcsProfilesPage } from './components/EcsProfilesPage'
import { SettingsPage } from './components/SettingsPage'
import { Toasts } from './components/Toasts'
import { CloudIcon, LayersIcon, PlusIcon, SpinnerIcon } from './components/Icons'
import { useApi } from './data/ApiContext'
import { errorMessage, pluralize } from './lib/format'
import { PAGE_META } from './lib/navigation'
import { useEcsMonitor } from './lib/useEcsMonitor'
import type { PageId, ToastItem, ToastTone } from './lib/ui'

const DEFAULT_SETTINGS: AppSettings = {
  refreshIntervalSeconds: 5,
  ecsRefreshIntervalSeconds: 60
}

export default function App() {
  const api = useApi()
  const [page, setPage] = useState<PageId>('k8s-pods')
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [clusters, setClusters] = useState<ClusterRecord[]>([])
  const [clustersError, setClustersError] = useState<string | null>(null)
  const [loadingClusters, setLoadingClusters] = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [results, setResults] = useState<Record<number, PodsResult>>({})
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set())
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const inFlight = useRef<Set<number>>(new Set())
  const clusterIdsRef = useRef<Set<number>>(new Set())
  const toastId = useRef(0)

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++toastId.current
    setToasts((previous) => [...previous.slice(-3), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== id))
    }, 4500)
  }, [])

  const loadClusters = useCallback(async () => {
    try {
      const list = await api.listClusters()
      setClusters(list)
      setClustersError(null)
      setActiveId((previous) =>
        previous !== null && list.some((cluster) => cluster.id === previous)
          ? previous
          : (list[0]?.id ?? null)
      )
    } catch (caught) {
      setClustersError(errorMessage(caught))
    } finally {
      setLoadingClusters(false)
    }
  }, [api])

  const fetchCluster = useCallback(async (id: number) => {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    setRefreshingIds((previous) => new Set(previous).add(id))
    try {
      const result = await api.listPods(id)
      if (!clusterIdsRef.current.has(id)) return
      setResults((previous) => {
        const old = previous[id]
        // Keep the last good snapshot visible while a cluster is unreachable.
        if (result.error && old && old.pods.length > 0) {
          return {
            ...previous,
            [id]: { ...result, pods: old.pods, version: result.version ?? old.version }
          }
        }
        return { ...previous, [id]: result }
      })
    } catch (caught) {
      if (!clusterIdsRef.current.has(id)) return
      const message = errorMessage(caught)
      setResults((previous) => {
        const old = previous[id]
        if (!old) {
          return {
            ...previous,
            [id]: {
              clusterId: id,
              pods: [],
              fetchedAt: new Date().toISOString(),
              version: null,
              error: message,
              latencyMs: 0
            }
          }
        }
        return { ...previous, [id]: { ...old, fetchedAt: new Date().toISOString(), error: message } }
      })
    } finally {
      inFlight.current.delete(id)
      setRefreshingIds((previous) => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
    }
  }, [api])

  const clusterIdsKey = clusters.map((cluster) => cluster.id).join(',')

  const refreshAll = useCallback(() => {
    if (!clusterIdsKey) return
    for (const id of clusterIdsKey.split(',')) void fetchCluster(Number(id))
  }, [clusterIdsKey, fetchCluster])

  // The Alibaba Cloud module keeps its own state, mirroring the Kubernetes one.
  const ecsEnabled = page === 'aliyun-ecs' || page === 'aliyun-profiles'
  const ecs = useEcsMonitor({
    enabled: ecsEnabled,
    autoRefresh,
    refreshIntervalSeconds: settings.ecsRefreshIntervalSeconds
  })

  useEffect(() => {
    void loadClusters()
  }, [loadClusters])

  useEffect(() => {
    void api
      .getAppInfo()
      .then(setAppInfo)
      .catch(() => undefined)
  }, [api])

  useEffect(() => {
    void api
      .getSettings()
      .then(setSettings)
      .catch(() => undefined)
  }, [api])

  useEffect(() => {
    clusterIdsRef.current = new Set(clusters.map((cluster) => cluster.id))
    setResults((previous) => {
      const keys = Object.keys(previous)
      if (keys.length === 0) return previous
      const next: Record<number, PodsResult> = {}
      let changed = false
      for (const key of keys) {
        const id = Number(key)
        if (clusterIdsRef.current.has(id)) next[id] = previous[id]
        else changed = true
      }
      return changed ? next : previous
    })
  }, [clusters])

  // Poll at the interval configured in Settings. Monitoring continues on the
  // Clusters and Settings pages so connection indicators stay current too.
  const refreshIntervalMs = Math.max(1000, settings.refreshIntervalSeconds * 1000)
  useEffect(() => {
    if (!autoRefresh || !clusterIdsKey) return
    refreshAll()
    const timer = window.setInterval(refreshAll, refreshIntervalMs)
    return () => window.clearInterval(timer)
  }, [autoRefresh, clusterIdsKey, refreshAll, refreshIntervalMs])

  // Fetch immediately when switching tabs or returning to the pods page.
  useEffect(() => {
    if (page !== 'k8s-pods' || activeId === null) return
    void fetchCluster(activeId)
  }, [page, activeId, fetchCluster])

  // Catch up immediately after the window has been hidden.
  useEffect(() => {
    function onVisibilityChange(): void {
      if (document.visibilityState === 'visible' && autoRefresh) {
        refreshAll()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [autoRefresh, refreshAll])

  const activeCluster = clusters.find((cluster) => cluster.id === activeId) ?? null
  const refreshing = refreshingIds.size > 0
  const polledCount = clusters.filter((cluster) => results[cluster.id] !== undefined).length
  const connectedCount = clusters.filter(
    (cluster) => results[cluster.id] && !results[cluster.id].error
  ).length
  const fleetTone =
    polledCount === 0
      ? 'idle'
      : connectedCount === clusters.length
        ? 'ok'
        : connectedCount === 0
          ? 'err'
          : 'warn'

  function renderPodsContent() {
    if (loadingClusters) {
      return (
        <div className="empty-card">
          <div className="empty-icon">
            <SpinnerIcon size={26} />
          </div>
          <h2 className="m-0 text-[17px] font-semibold">Loading clusters…</h2>
        </div>
      )
    }

    if (clustersError && clusters.length === 0) {
      return (
        <div className="empty-card">
          <div className="empty-icon error">
            <LayersIcon size={30} />
          </div>
          <h2 className="m-0 text-[17px] font-semibold">Could not load clusters</h2>
          <p className="mx-auto mt-2 mb-5 max-w-[400px] text-[12.5px] leading-[1.55] text-muted">
            {clustersError}
          </p>
          <button type="button" className="btn" onClick={() => void loadClusters()}>
            Try again
          </button>
        </div>
      )
    }

    if (clusters.length === 0) {
      return (
        <div className="empty-card">
          <div className="empty-icon">
            <LayersIcon size={30} />
          </div>
          <h2 className="m-0 text-[17px] font-semibold">No clusters connected</h2>
          <p className="mx-auto mt-2 mb-5 max-w-[400px] text-[12.5px] leading-[1.55] text-muted">
            Add a cluster with a kubeconfig file or an API server URL and bearer token. ServerMon
            polls every cluster's pods every 5 seconds.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setPage('k8s-clusters')}
          >
            <PlusIcon />
            Add your first cluster
          </button>
        </div>
      )
    }

    if (!activeCluster) {
      return (
        <div className="empty-card">
          <h2 className="m-0 text-[17px] font-semibold">Select a cluster</h2>
        </div>
      )
    }

    return (
      <PodsView
        key={activeCluster.id}
        cluster={activeCluster}
        result={results[activeCluster.id]}
        fetching={refreshingIds.has(activeCluster.id)}
        autoRefresh={autoRefresh}
        refreshIntervalSeconds={settings.refreshIntervalSeconds}
      />
    )
  }

  function renderEcsContent() {
    if (ecs.loading) {
      return (
        <div className="empty-card">
          <div className="empty-icon">
            <SpinnerIcon size={26} />
          </div>
          <h2 className="m-0 text-[17px] font-semibold">Loading Alibaba Cloud profiles…</h2>
        </div>
      )
    }

    if (ecs.loadError && ecs.profiles.length === 0) {
      return (
        <div className="empty-card">
          <div className="empty-icon error">
            <CloudIcon size={30} />
          </div>
          <h2 className="m-0 text-[17px] font-semibold">Could not load Alibaba Cloud profiles</h2>
          <p className="mx-auto mt-2 mb-5 max-w-[400px] text-[12.5px] leading-[1.55] text-muted">
            {ecs.loadError}
          </p>
          <button type="button" className="btn" onClick={() => void ecs.reload()}>
            Try again
          </button>
        </div>
      )
    }

    if (ecs.profiles.length === 0) {
      return (
        <div className="empty-card">
          <div className="empty-icon">
            <CloudIcon size={30} />
          </div>
          <h2 className="m-0 text-[17px] font-semibold">No Alibaba Cloud profiles</h2>
          <p className="mx-auto mt-2 mb-5 max-w-[440px] text-[12.5px] leading-[1.55] text-muted">
            Add a profile with a RAM AccessKey and a region to list ECS instances through the
            Alibaba Cloud OpenAPI. Add as many profiles as you need.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setPage('aliyun-profiles')}
          >
            <PlusIcon />
            Add your first profile
          </button>
        </div>
      )
    }

    if (!ecs.activeProfile) {
      return (
        <div className="empty-card">
          <h2 className="m-0 text-[17px] font-semibold">Select a profile</h2>
        </div>
      )
    }

    return (
      <EcsInstancesView
        key={ecs.activeProfile.id}
        profile={ecs.activeProfile}
        result={ecs.results[ecs.activeProfile.id]}
        fetching={ecs.refreshingActive}
        autoRefresh={autoRefresh}
        refreshIntervalSeconds={settings.ecsRefreshIntervalSeconds}
      />
    )
  }

  return (
    <div className="app-bg flex h-screen">
      <Sidebar
        page={page}
        onNavigate={setPage}
        version={appInfo?.version}
        isMac={appInfo?.platform === 'darwin'}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          moduleLabel={PAGE_META[page].module}
          pageLabel={PAGE_META[page].title}
          showControls={true}
          refreshIntervalSeconds={
            page === 'aliyun-ecs' || page === 'aliyun-profiles'
              ? settings.ecsRefreshIntervalSeconds
              : settings.refreshIntervalSeconds
          }
          autoRefresh={autoRefresh}
          onToggleAutoRefresh={() => setAutoRefresh((value) => !value)}
          onRefresh={() => {
            refreshAll()
            ecs.refreshAll()
          }}
          refreshing={refreshing || ecs.refreshing}
        />

        <main className="flex min-h-0 flex-1 flex-col">
          {page === 'k8s-pods' ? (
            <>
              {clusters.length > 0 && (
                <ClusterTabs
                  clusters={clusters}
                  activeId={activeId}
                  results={results}
                  onSelect={setActiveId}
                  onAddCluster={() => setPage('k8s-clusters')}
                />
              )}
              <div className="min-h-0 flex-1 overflow-auto">
                {clusters.length > 0 && (
                  <div
                    className="mx-auto flex max-w-[1680px] items-center gap-[7px] px-[22px] pt-2.5 text-[11px] text-dim"
                    aria-label="Fleet summary"
                  >
                    <span className={`status-dot ${fleetTone}`} />
                    {polledCount === 0
                      ? `Monitoring ${pluralize(clusters.length, 'cluster')} · refresh every ${settings.refreshIntervalSeconds}s`
                      : `${connectedCount} of ${pluralize(clusters.length, 'cluster')} connected`}
                    {clustersError && <span className="text-err"> · {clustersError}</span>}
                  </div>
                )}
                {renderPodsContent()}
              </div>
            </>
          ) : page === 'k8s-clusters' ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <ConfigPage
                clusters={clusters}
                results={results}
                onChanged={loadClusters}
                toast={toast}
                refreshIntervalSeconds={settings.refreshIntervalSeconds}
              />
            </div>
          ) : page === 'aliyun-ecs' ? (
            <>
              {ecs.profiles.length > 0 && (
                <EcsProfileTabs
                  profiles={ecs.profiles}
                  activeId={ecs.activeId}
                  results={ecs.results}
                  onSelect={ecs.select}
                  onAddProfile={() => setPage('aliyun-profiles')}
                />
              )}
              <div className="min-h-0 flex-1 overflow-auto">
                {ecs.profiles.length > 0 && (
                  <div
                    className="mx-auto flex max-w-[1680px] items-center gap-[7px] px-[22px] pt-2.5 text-[11px] text-dim"
                    aria-label="Alibaba Cloud fleet summary"
                  >
                    <span className={`status-dot ${ecs.fleetTone}`} />
                    {ecs.polledCount === 0
                      ? `Monitoring ${pluralize(ecs.profiles.length, 'profile')} · refresh every ${settings.ecsRefreshIntervalSeconds}s`
                      : `${ecs.connectedCount} of ${pluralize(ecs.profiles.length, 'profile')} connected`}
                    {ecs.loadError && <span className="text-err"> · {ecs.loadError}</span>}
                  </div>
                )}
                {renderEcsContent()}
              </div>
            </>
          ) : page === 'aliyun-profiles' ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <EcsProfilesPage
                profiles={ecs.profiles}
                results={ecs.results}
                onChanged={ecs.reload}
                toast={toast}
                refreshIntervalSeconds={settings.ecsRefreshIntervalSeconds}
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <SettingsPage settings={settings} onSaved={setSettings} toast={toast} />
            </div>
          )}
        </main>
      </div>

      <Toasts toasts={toasts} />
    </div>
  )
}
