import { useState } from 'react'
import type {
  EcsConnectionTestResult,
  EcsInstancesResult,
  EcsProfileInput,
  EcsProfileRecord
} from '@shared/types'
import { EcsProfileForm } from './EcsProfileForm'
import { Modal } from './Modal'
import {
  CloudIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon
} from './Icons'
import { useApi } from '../data/ApiContext'
import { errorMessage, pluralize } from '../lib/format'
import type { ToastTone } from '../lib/ui'

interface EcsProfilesPageProps {
  profiles: EcsProfileRecord[]
  results: Record<number, EcsInstancesResult>
  onChanged: () => Promise<void> | void
  toast: (message: string, tone?: ToastTone) => void
  refreshIntervalSeconds: number
}

interface RowTest {
  testing: boolean
  result?: EcsConnectionTestResult
}

function profileToInput(profile: EcsProfileRecord): EcsProfileInput {
  return {
    name: profile.name,
    regionId: profile.regionId,
    accessKeyId: profile.accessKeyId,
    accessKeySecret: '',
    endpoint: profile.endpoint
  }
}

const TH =
  'border-b border-line bg-panel-2 px-3.5 py-[11px] text-left text-[10.5px] font-medium tracking-[0.07em] whitespace-nowrap text-dim uppercase'
const TD = 'border-b border-line/60 px-3.5 py-3 align-middle'

export function EcsProfilesPage({
  profiles,
  results,
  onChanged,
  toast,
  refreshIntervalSeconds
}: EcsProfilesPageProps) {
  const api = useApi()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EcsProfileRecord | null>(null)
  const [confirming, setConfirming] = useState<EcsProfileRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [tests, setTests] = useState<Record<number, RowTest>>({})

  function openAdd(): void {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(profile: EcsProfileRecord): void {
    setEditing(profile)
    setFormOpen(true)
  }

  function closeForm(): void {
    setFormOpen(false)
    setEditing(null)
  }

  async function handleTest(profile: EcsProfileRecord): Promise<void> {
    setTests((previous) => ({ ...previous, [profile.id]: { testing: true } }))
    try {
      const result = await api.testEcsProfile(profileToInput(profile), profile.id)
      setTests((previous) => ({ ...previous, [profile.id]: { testing: false, result } }))
      if (result.ok) {
        toast(
          `Connected to ${profile.name} · ${pluralize(result.instanceCount ?? 0, 'instance')}`,
          'ok'
        )
      } else {
        toast(`${profile.name}: ${result.error}`, 'error')
      }
    } catch (caught) {
      const message = errorMessage(caught)
      setTests((previous) => ({
        ...previous,
        [profile.id]: { testing: false, result: { ok: false, error: message } }
      }))
      toast(message, 'error')
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirming) return
    setDeleting(true)
    try {
      await api.deleteEcsProfile(confirming.id)
      toast(`Removed "${confirming.name}".`, 'ok')
      setConfirming(null)
      await onChanged()
    } catch (caught) {
      toast(errorMessage(caught), 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSaved(saved: EcsProfileRecord): Promise<void> {
    const previousName = editing?.name
    closeForm()
    toast(previousName ? `Updated "${saved.name}".` : `Added "${saved.name}".`, 'ok')
    await onChanged()
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-6 pt-[26px] pb-10">
      <div className="mb-5 flex items-start justify-between gap-6 max-[980px]:flex-col">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em]">Alibaba Cloud profiles</h1>
          <p className="mt-[7px] max-w-[640px] text-[12.5px] leading-[1.5] text-muted">
            Manage the OpenAPI credentials ServerMon uses to read ECS instances. Instances
            refresh every {refreshIntervalSeconds} seconds.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openAdd}
          data-testid="add-ecs-profile"
        >
          <PlusIcon />
          Add profile
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="empty-card">
          <div className="empty-icon">
            <CloudIcon size={30} />
          </div>
          <h2 className="m-0 text-[17px] font-semibold">No Alibaba Cloud profiles yet</h2>
          <p className="mx-auto mt-2 mb-5 max-w-[420px] text-[12.5px] leading-[1.55] text-muted">
            Add a profile with a RAM AccessKey and a region. You can add as many profiles as you
            need — one per account or region.
          </p>
          <button type="button" className="btn btn-primary" onClick={openAdd}>
            <PlusIcon />
            Add your first profile
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
                <th scope="col" className={`${TH} w-[170px]`}>
                  Region
                </th>
                <th scope="col" className={TH}>
                  AccessKey ID
                </th>
                <th scope="col" className={`${TH} w-[130px]`}>
                  Instances
                </th>
                <th scope="col" className={`${TH} w-[290px] text-right`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {profiles.map((profile) => {
                const result = results[profile.id]
                const test = tests[profile.id]
                const testError = test?.result && !test.result.ok ? test.result.error : null
                const error = testError ?? result?.error ?? null
                const tone = error ? 'err' : result ? 'ok' : 'idle'
                const instanceCount = test?.result?.ok
                  ? test.result.instanceCount
                  : (result?.instances.length ?? null)

                return (
                  <tr key={profile.id} className="hover:bg-accent/[0.035]">
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
                      <span className="config-name text-[13px] font-semibold">{profile.name}</span>
                    </td>
                    <td className={TD}>
                      <span className="font-mono text-[11.5px]">{profile.regionId}</span>
                    </td>
                    <td className={`${TD} max-w-[320px] truncate text-muted`}>
                      <span className="font-mono text-[11.5px]" title={profile.accessKeyId}>
                        {profile.accessKeyId}
                      </span>
                    </td>
                    <td className={TD}>
                      {instanceCount === null ? (
                        <span className="text-dim">—</span>
                      ) : (
                        <span className="font-mono text-[11.5px] tabular-nums">
                          {instanceCount}
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => void handleTest(profile)}
                          disabled={test?.testing}
                          title="Test connection"
                        >
                          {test?.testing ? <SpinnerIcon /> : <PlugIcon />}
                          Test
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => openEdit(profile)}
                          title="Edit profile"
                        >
                          <PencilIcon />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger-ghost"
                          onClick={() => setConfirming(profile)}
                          title="Remove profile"
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
        AccessKeys are stored locally in a SQLite database. ServerMon only reads instance
        inventory — it never starts, stops, or modifies your ECS instances.
      </p>

      {formOpen && (
        <EcsProfileForm profile={editing} onClose={closeForm} onSaved={handleSaved} />
      )}

      {confirming && (
        <Modal
          size="sm"
          title="Remove profile"
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
                data-testid="confirm-delete-ecs-profile"
              >
                {deleting ? <SpinnerIcon /> : <TrashIcon />}
                Remove
              </button>
            </>
          }
        >
          <p className="m-0 text-[12.5px] leading-[1.6] text-muted">
            Stop monitoring <strong className="text-ink">{confirming.name}</strong>? Your ECS
            instances are not affected — this only removes the credentials from ServerMon.
          </p>
        </Modal>
      )}
    </div>
  )
}
