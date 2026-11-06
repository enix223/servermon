import { useState } from 'react'
import type {
  ClusterInput,
  ClusterRecord,
  ConnectionTestResult,
  PodsResult
} from '@shared/types'
import { ClusterForm } from './ClusterForm'
import { Modal } from './Modal'
import {
  LayersIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon
} from './Icons'
import { useApi } from '../data/ApiContext'
import { errorMessage, formatVersion } from '../lib/format'
import type { ToastTone } from '../lib/ui'

interface ConfigPageProps {
  clusters: ClusterRecord[]
  results: Record<number, PodsResult>
  onChanged: () => Promise<void> | void
  toast: (message: string, tone?: ToastTone) => void
  refreshIntervalSeconds: number
}

interface RowTest {
  testing: boolean
  result?: ConnectionTestResult
}

function clusterToInput(cluster: ClusterRecord): ClusterInput {
  return {
    name: cluster.name,
    server: cluster.server,
    authType: cluster.authType,
    kubeconfigPath: cluster.kubeconfigPath,
    kubeconfigContext: cluster.kubeconfigContext,
    caCert: cluster.caCert,
    skipTlsVerify: cluster.skipTlsVerify,
    token: ''
  }
}

const TH =
  'border-b border-line bg-panel-2 px-3.5 py-[11px] text-left text-[10.5px] font-medium tracking-[0.07em] whitespace-nowrap text-dim uppercase'
const TD = 'border-b border-line/60 px-3.5 py-3 align-middle'

export function ConfigPage({
  clusters,
  results,
  onChanged,
  toast,
  refreshIntervalSeconds
}: ConfigPageProps) {
  const api = useApi()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ClusterRecord | null>(null)
  const [confirming, setConfirming] = useState<ClusterRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [tests, setTests] = useState<Record<number, RowTest>>({})

  function openAdd(): void {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(cluster: ClusterRecord): void {
    setEditing(cluster)
    setFormOpen(true)
  }

  function closeForm(): void {
    setFormOpen(false)
    setEditing(null)
  }

  async function handleTest(cluster: ClusterRecord): Promise<void> {
    setTests((previous) => ({ ...previous, [cluster.id]: { testing: true } }))
    try {
      const result = await api.testCluster(clusterToInput(cluster), cluster.id)
      setTests((previous) => ({ ...previous, [cluster.id]: { testing: false, result } }))
      if (result.ok) {
        toast(`Connected to ${cluster.name} · ${formatVersion(result.version)}`, 'ok')
      } else {
        toast(`${cluster.name}: ${result.error}`, 'error')
      }
    } catch (caught) {
      const message = errorMessage(caught)
      setTests((previous) => ({
        ...previous,
        [cluster.id]: { testing: false, result: { ok: false, error: message } }
      }))
      toast(message, 'error')
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirming) return
    setDeleting(true)
    try {
      await api.deleteCluster(confirming.id)
      toast(`Removed "${confirming.name}".`, 'ok')
      setConfirming(null)
      await onChanged()
    } catch (caught) {
      toast(errorMessage(caught), 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSaved(saved: ClusterRecord): Promise<void> {
    const previousName = editing?.name
    closeForm()
    toast(previousName ? `Updated "${saved.name}".` : `Added "${saved.name}".`, 'ok')
    await onChanged()
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-6 pt-[26px] pb-10">
      <div className="mb-5 flex items-start justify-between gap-6 max-[980px]:flex-col">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em]">Clusters</h1>
          <p className="mt-[7px] max-w-[640px] text-[12.5px] leading-[1.5] text-muted">
            Manage the Kubernetes API connections ServerMon polls. Pod status refreshes every{' '}
            {refreshIntervalSeconds} seconds.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd} data-testid="add-cluster">
          <PlusIcon />
          Add cluster
        </button>
      </div>

      {clusters.length === 0 ? (
        <div className="empty-card">
          <div className="empty-icon">
            <LayersIcon size={30} />
          </div>
          <h2 className="m-0 text-[17px] font-semibold">No clusters yet</h2>
          <p className="mx-auto mt-2 mb-5 max-w-[400px] text-[12.5px] leading-[1.55] text-muted">
            Add a cluster using a kubeconfig file or an API server URL and bearer token. You can
            mix both methods across clusters.
          </p>
          <button type="button" className="btn btn-primary" onClick={openAdd}>
            <PlusIcon />
            Add your first cluster
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="config-table w-full table-fixed border-separate border-spacing-0 text-[12.5px]">
            <thead>
              <tr>
                <th scope="col" className={`${TH} w-20`}>
                  Status
                </th>
                <th scope="col" className={`${TH} w-[210px]`}>
                  Name
                </th>
                <th scope="col" className={TH}>
                  API server
                </th>
                <th scope="col" className={`${TH} w-[230px]`}>
                  Authentication
                </th>
                <th scope="col" className={`${TH} w-[110px]`}>
                  Version
                </th>
                <th scope="col" className={`${TH} w-[290px] text-right`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {clusters.map((cluster) => {
                const result = results[cluster.id]
                const test = tests[cluster.id]
                const testError = test?.result && !test.result.ok ? test.result.error : null
                const error = testError ?? result?.error ?? null
                const tone = error ? 'err' : result ? 'ok' : 'idle'
                const version =
                  (test?.result?.ok ? test.result.version : undefined) ?? result?.version ?? null

                return (
                  <tr key={cluster.id} className="hover:bg-accent/[0.035]">
                    <td className={TD}>
                      <span
                        className={`status-dot ${tone}`}
                        title={
                          error ??
                          (result ? 'Connected — last refresh succeeded' : 'Not polled yet')
                        }
                      />
                    </td>
                    <td className={TD}>
                      <span className="config-name text-[13px] font-semibold">{cluster.name}</span>
                    </td>
                    <td className={`${TD} max-w-[320px] truncate text-muted`}>
                      {cluster.server ? (
                        <span className="font-mono text-[11.5px]" title={cluster.server}>
                          {cluster.server}
                        </span>
                      ) : (
                        <span className="text-dim" title={cluster.kubeconfigPath ?? ''}>
                          From kubeconfig
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <div className="flex flex-col gap-0.5">
                        <span>
                          {cluster.authType === 'kubeconfig' ? 'Kubeconfig' : 'Bearer token'}
                        </span>
                        <span className="text-[10.5px] text-dim">
                          {cluster.authType === 'kubeconfig'
                            ? cluster.kubeconfigContext || 'current context'
                            : cluster.skipTlsVerify
                              ? 'TLS verification off'
                              : cluster.caCert
                                ? 'custom CA'
                                : 'system CA'}
                        </span>
                      </div>
                    </td>
                    <td className={TD}>
                      {version ? (
                        <span className="font-mono text-[11.5px]">{formatVersion(version)}</span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className={TD}>
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => void handleTest(cluster)}
                          disabled={test?.testing}
                          title="Test connection"
                        >
                          {test?.testing ? <SpinnerIcon /> : <PlugIcon />}
                          Test
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => openEdit(cluster)}
                          title="Edit cluster"
                        >
                          <PencilIcon />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger-ghost"
                          onClick={() => setConfirming(cluster)}
                          title="Remove cluster"
                        >
                          <TrashIcon />
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-[1.5] text-dim">
        Connections are stored locally in a SQLite database. ServerMon never modifies your
        clusters — it only reads pod status.
      </p>

      {formOpen && <ClusterForm cluster={editing} onClose={closeForm} onSaved={handleSaved} />}

      {confirming && (
        <Modal
          size="sm"
          title="Remove cluster"
          onClose={() => {
            if (!deleting) setConfirming(null)
          }}
          footer={
            <>
              <div className="flex-1" />
              <button
                type="button"
                className="btn"
                onClick={() => setConfirming(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void handleDelete()}
                disabled={deleting}
                data-testid="confirm-delete"
              >
                {deleting ? <SpinnerIcon /> : <TrashIcon />}
                Remove
              </button>
            </>
          }
        >
          <p className="m-0 text-[12.5px] leading-[1.6] text-muted">
            Stop monitoring <strong className="text-ink">{confirming.name}</strong>? The cluster
            and its workloads are not affected — this only removes the connection from ServerMon.
          </p>
        </Modal>
      )}
    </div>
  )
}
