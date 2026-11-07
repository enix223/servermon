import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EcsInstancesResult, EcsProfileRecord } from '@shared/types'
import { useApi } from '../data/ApiContext'
import { errorMessage } from './format'
import type { Tone } from './pods'

export interface EcsMonitorState {
  profiles: EcsProfileRecord[]
  results: Record<number, EcsInstancesResult>
  activeId: number | null
  activeProfile: EcsProfileRecord | null
  loading: boolean
  loadError: string | null
  /** True while any profile is being fetched. */
  refreshing: boolean
  /** True while the active profile is being fetched. */
  refreshingActive: boolean
  connectedCount: number
  polledCount: number
  fleetTone: Tone
  reload: () => Promise<void>
  select: (id: number) => void
  refreshAll: () => void
}

interface UseEcsMonitorOptions {
  /** Whether the Alibaba Cloud module is on screen. */
  enabled: boolean
  autoRefresh: boolean
  refreshIntervalSeconds: number
}

/**
 * Holds the Alibaba Cloud module state: the profile list, the instance
 * snapshot per profile, and the polling loop.
 *
 * This mirrors the Kubernetes module in App.tsx. The Alibaba Cloud OpenAPI is
 * rate limited, so polling only runs while the module is on screen.
 */
export function useEcsMonitor({
  enabled,
  autoRefresh,
  refreshIntervalSeconds
}: UseEcsMonitorOptions): EcsMonitorState {
  const api = useApi()
  const [profiles, setProfiles] = useState<EcsProfileRecord[]>([])
  const [results, setResults] = useState<Record<number, EcsInstancesResult>>({})
  const [activeId, setActiveId] = useState<number | null>(null)
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const inFlight = useRef<Set<number>>(new Set())
  const profileIdsRef = useRef<Set<number>>(new Set())

  const reload = useCallback(async () => {
    try {
      const list = await api.listEcsProfiles()
      setProfiles(list)
      setLoadError(null)
      setActiveId((previous) =>
        previous !== null && list.some((profile) => profile.id === previous)
          ? previous
          : (list[0]?.id ?? null)
      )
    } catch (caught) {
      setLoadError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [api])

  const fetchProfile = useCallback(
    async (id: number) => {
      if (inFlight.current.has(id)) return
      inFlight.current.add(id)
      setRefreshingIds((previous) => new Set(previous).add(id))
      try {
        const result = await api.listEcsInstances(id)
        if (!profileIdsRef.current.has(id)) return
        setResults((previous) => {
          const old = previous[id]
          // Keep the last good snapshot visible while a profile is unreachable.
          if (result.error && old && old.instances.length > 0) {
            return { ...previous, [id]: { ...result, instances: old.instances } }
          }
          return { ...previous, [id]: result }
        })
      } catch (caught) {
        if (!profileIdsRef.current.has(id)) return
        const message = errorMessage(caught)
        setResults((previous) => {
          const old = previous[id]
          if (!old) {
            return {
              ...previous,
              [id]: {
                profileId: id,
                instances: [],
                fetchedAt: new Date().toISOString(),
                totalCount: 0,
                error: message,
                latencyMs: 0
              }
            }
          }
          return {
            ...previous,
            [id]: { ...old, fetchedAt: new Date().toISOString(), error: message }
          }
        })
      } finally {
        inFlight.current.delete(id)
        setRefreshingIds((previous) => {
          const next = new Set(previous)
          next.delete(id)
          return next
        })
      }
    },
    [api]
  )

  const profileIdsKey = profiles.map((profile) => profile.id).join(',')

  const refreshAll = useCallback(() => {
    if (!profileIdsKey) return
    for (const id of profileIdsKey.split(',')) void fetchProfile(Number(id))
  }, [profileIdsKey, fetchProfile])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    profileIdsRef.current = new Set(profiles.map((profile) => profile.id))
    setResults((previous) => {
      const keys = Object.keys(previous)
      if (keys.length === 0) return previous
      const next: Record<number, EcsInstancesResult> = {}
      let changed = false
      for (const key of keys) {
        const id = Number(key)
        if (profileIdsRef.current.has(id)) next[id] = previous[id]
        else changed = true
      }
      return changed ? next : previous
    })
  }, [profiles])

  // Poll at the configured interval, but only while the module is on screen so
  // the Alibaba Cloud API quota is not spent in the background.
  const refreshIntervalMs = Math.max(1000, refreshIntervalSeconds * 1000)
  useEffect(() => {
    if (!enabled || !autoRefresh || !profileIdsKey) return
    refreshAll()
    const timer = window.setInterval(refreshAll, refreshIntervalMs)
    return () => window.clearInterval(timer)
  }, [enabled, autoRefresh, profileIdsKey, refreshAll, refreshIntervalMs])

  // Fetch immediately when switching tabs or returning to the servers page.
  useEffect(() => {
    if (!enabled || activeId === null) return
    void fetchProfile(activeId)
  }, [enabled, activeId, fetchProfile])

  // Catch up immediately after the window has been hidden.
  useEffect(() => {
    if (!enabled) return
    function onVisibilityChange(): void {
      if (document.visibilityState === 'visible' && autoRefresh) {
        refreshAll()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [enabled, autoRefresh, refreshAll])

  const activeProfile = profiles.find((profile) => profile.id === activeId) ?? null
  const polledCount = profiles.filter((profile) => results[profile.id] !== undefined).length
  const connectedCount = profiles.filter(
    (profile) => results[profile.id] && !results[profile.id].error
  ).length
  const fleetTone: Tone =
    polledCount === 0
      ? 'idle'
      : connectedCount === profiles.length
        ? 'ok'
        : connectedCount === 0
          ? 'err'
          : 'warn'

  return useMemo(
    () => ({
      profiles,
      results,
      activeId,
      activeProfile,
      loading,
      loadError,
      refreshing: refreshingIds.size > 0,
      refreshingActive: activeId !== null && refreshingIds.has(activeId),
      connectedCount,
      polledCount,
      fleetTone,
      reload,
      select: setActiveId,
      refreshAll
    }),
    [
      profiles,
      results,
      activeId,
      activeProfile,
      loading,
      loadError,
      refreshingIds,
      connectedCount,
      polledCount,
      fleetTone,
      reload,
      refreshAll
    ]
  )
}
