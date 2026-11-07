import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { EcsConnectionTestResult, EcsProfileInput, EcsProfileRecord } from '@shared/types'
import { Modal } from './Modal'
import {
  AlertIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  PlugIcon,
  SpinnerIcon
} from './Icons'
import { useApi } from '../data/ApiContext'
import { ALIYUN_REGIONS } from '../lib/ecs'
import { errorMessage, formatLatency } from '../lib/format'

interface EcsProfileFormProps {
  profile: EcsProfileRecord | null
  onClose: () => void
  onSaved: (saved: EcsProfileRecord) => void | Promise<void>
}

interface FieldProps {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
}

function Field({ label, hint, htmlFor, children }: FieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {htmlFor ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="field-label">{label}</span>
      )}
      {children}
      {hint && <p className="m-0 text-[10.5px] leading-[1.45] text-dim">{hint}</p>}
    </div>
  )
}

export function EcsProfileForm({ profile, onClose, onSaved }: EcsProfileFormProps) {
  const api = useApi()
  const [name, setName] = useState(profile?.name ?? '')
  const [regionId, setRegionId] = useState(profile?.regionId ?? '')
  const [accessKeyId, setAccessKeyId] = useState(profile?.accessKeyId ?? '')
  const [accessKeySecret, setAccessKeySecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [endpoint, setEndpoint] = useState(profile?.endpoint ?? '')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<EcsConnectionTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTestResult(null)
  }, [name, regionId, accessKeyId, accessKeySecret, endpoint])

  function buildInput(): EcsProfileInput {
    return { name, regionId, accessKeyId, accessKeySecret, endpoint }
  }

  function validate(): string | null {
    if (!name.trim()) return 'Profile name is required.'
    if (!regionId.trim()) return 'Region is required.'
    if (!/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/i.test(regionId.trim())) {
      return 'Region must look like "cn-hangzhou" or "us-east-1".'
    }
    if (!accessKeyId.trim()) return 'AccessKey ID is required.'
    if (!accessKeySecret.trim() && !profile?.hasSecret) return 'AccessKey secret is required.'
    if (endpoint.trim()) {
      try {
        // eslint-disable-next-line no-new
        new URL(endpoint.trim().includes('://') ? endpoint.trim() : `https://${endpoint.trim()}`)
      } catch {
        return 'Endpoint is not a valid host name.'
      }
    }
    return null
  }

  async function handleTest(): Promise<void> {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setTestResult(null)
    setTesting(true)
    try {
      const result = await api.testEcsProfile(buildInput(), profile?.id)
      setTestResult(result)
    } catch (caught) {
      setTestResult({ ok: false, error: errorMessage(caught) })
    } finally {
      setTesting(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const input = buildInput()
      const saved = profile
        ? await api.updateEcsProfile(profile.id, input)
        : await api.createEcsProfile(input)
      await onSaved(saved)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={profile ? 'Edit profile' : 'Add profile'}
      subtitle={
        profile
          ? `Update the connection details for ${profile.name}.`
          : 'Connect an Alibaba Cloud account to list its ECS instances.'
      }
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn"
            onClick={() => void handleTest()}
            disabled={testing || saving}
            data-testid="test-ecs-profile"
          >
            {testing ? <SpinnerIcon /> : <PlugIcon />}
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <div className="flex-1" />
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            form="ecs-profile-form"
            className="btn btn-primary"
            disabled={saving || testing}
            data-testid="save-ecs-profile"
          >
            {saving && <SpinnerIcon />}
            {profile ? 'Save changes' : 'Add profile'}
          </button>
        </>
      }
    >
      <form id="ecs-profile-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <Field label="Profile name" htmlFor="ecs-profile-name">
            <input
              id="ecs-profile-name"
              data-testid="ecs-profile-name"
              className="text-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="prod-cn-hangzhou"
              autoFocus
              spellCheck={false}
            />
          </Field>
          <Field
            label="Region"
            htmlFor="ecs-profile-region"
            hint="Alibaba Cloud region id, e.g. cn-hangzhou."
          >
            <input
              id="ecs-profile-region"
              data-testid="ecs-profile-region"
              className="text-input font-mono"
              value={regionId}
              onChange={(event) => setRegionId(event.target.value)}
              placeholder="cn-hangzhou"
              list="aliyun-regions"
              spellCheck={false}
            />
            <datalist id="aliyun-regions">
              {ALIYUN_REGIONS.map((region) => (
                <option key={region} value={region} />
              ))}
            </datalist>
          </Field>
        </div>

        <Field
          label="AccessKey ID"
          htmlFor="ecs-profile-access-key-id"
          hint="A RAM user AccessKey with permission to list ECS instances (ecs:DescribeInstances)."
        >
          <input
            id="ecs-profile-access-key-id"
            data-testid="ecs-profile-access-key-id"
            className="text-input font-mono"
            value={accessKeyId}
            onChange={(event) => setAccessKeyId(event.target.value)}
            placeholder="LTAI5t…"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field
          label="AccessKey secret"
          htmlFor="ecs-profile-access-key-secret"
          hint={
            profile?.hasSecret
              ? 'A secret is already stored. Leave this blank to keep it.'
              : 'Stored locally in the ServerMon database and never sent anywhere else.'
          }
        >
          <div className="relative">
            <input
              id="ecs-profile-access-key-secret"
              data-testid="ecs-profile-access-key-secret"
              className="text-input pr-10"
              type={showSecret ? 'text' : 'password'}
              value={accessKeySecret}
              onChange={(event) => setAccessKeySecret(event.target.value)}
              placeholder={profile?.hasSecret ? '••••••••••••  (stored)' : 'your AccessKey secret'}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="input-action"
              onClick={() => setShowSecret((value) => !value)}
              aria-label={showSecret ? 'Hide secret' : 'Show secret'}
            >
              {showSecret ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </Field>

        <Field
          label="Endpoint override (optional)"
          htmlFor="ecs-profile-endpoint"
          hint="Defaults to https://ecs.{region}.aliyuncs.com. Use an internal endpoint if your network requires one."
        >
          <input
            id="ecs-profile-endpoint"
            data-testid="ecs-profile-endpoint"
            className="text-input font-mono"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder="ecs.cn-hangzhou.aliyuncs.com"
            spellCheck={false}
          />
        </Field>

        {testResult && (
          <div className={`test-result ${testResult.ok ? 'ok' : 'error'}`} role="status">
            {testResult.ok ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
            <div className="flex min-w-0 flex-col gap-0.5">
              <strong>
                {testResult.ok
                  ? `Connected · ${testResult.regionId ?? 'region resolved'}`
                  : 'Connection failed'}
              </strong>
              <span>
                {testResult.ok
                  ? `${testResult.instanceCount ?? 0} instances visible · ${formatLatency(
                      testResult.latencyMs ?? 0
                    )} round-trip`
                  : testResult.error}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="form-error" role="alert">
            <AlertIcon size={15} />
            {error}
          </div>
        )}
      </form>
    </Modal>
  )
}
