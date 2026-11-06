import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type {
  AuthType,
  ClusterInput,
  ClusterRecord,
  ConnectionTestResult
} from '@shared/types'
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
import { errorMessage, formatLatency, formatVersion } from '../lib/format'

interface ClusterFormProps {
  cluster: ClusterRecord | null
  onClose: () => void
  onSaved: (saved: ClusterRecord) => void | Promise<void>
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

export function ClusterForm({ cluster, onClose, onSaved }: ClusterFormProps) {
  const api = useApi()
  const [name, setName] = useState(cluster?.name ?? '')
  const [server, setServer] = useState(cluster?.server ?? '')
  const [authType, setAuthType] = useState<AuthType>(cluster?.authType ?? 'kubeconfig')
  const [kubeconfigPath, setKubeconfigPath] = useState(cluster?.kubeconfigPath ?? '')
  const [kubeconfigContext, setKubeconfigContext] = useState(cluster?.kubeconfigContext ?? '')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [caCert, setCaCert] = useState(cluster?.caCert ?? '')
  const [skipTlsVerify, setSkipTlsVerify] = useState(cluster?.skipTlsVerify ?? false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTestResult(null)
  }, [name, server, authType, kubeconfigPath, kubeconfigContext, token, caCert, skipTlsVerify])

  function buildInput(): ClusterInput {
    return {
      name,
      server,
      authType,
      kubeconfigPath,
      kubeconfigContext,
      token,
      caCert,
      skipTlsVerify
    }
  }

  function validate(): string | null {
    if (!name.trim()) return 'Cluster name is required.'
    if (authType === 'kubeconfig') {
      if (!kubeconfigPath.trim()) return 'Kubeconfig file path is required.'
      return null
    }
    if (!server.trim()) return 'API server URL is required for token authentication.'
    try {
      const url = new URL(server.trim())
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'API server URL must start with http:// or https://.'
      }
    } catch {
      return 'API server URL is invalid.'
    }
    if (!token.trim() && !cluster?.hasToken) return 'Bearer token is required.'
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
      const result = await api.testCluster(buildInput(), cluster?.id)
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
      const saved = cluster
        ? await api.updateCluster(cluster.id, input)
        : await api.createCluster(input)
      await onSaved(saved)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={cluster ? 'Edit cluster' : 'Add cluster'}
      subtitle={
        cluster
          ? `Update the connection details for ${cluster.name}.`
          : 'Connect another Kubernetes API server.'
      }
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn"
            onClick={() => void handleTest()}
            disabled={testing || saving}
            data-testid="test-cluster"
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
            form="cluster-form"
            className="btn btn-primary"
            disabled={saving || testing}
            data-testid="save-cluster"
          >
            {saving && <SpinnerIcon />}
            {cluster ? 'Save changes' : 'Add cluster'}
          </button>
        </>
      }
    >
      <form id="cluster-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <Field label="Cluster name" htmlFor="cluster-name">
            <input
              id="cluster-name"
              data-testid="cluster-name"
              className="text-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="prod-us-east"
              autoFocus
              spellCheck={false}
            />
          </Field>
          <Field label="Authentication">
            <div className="segmented" role="group" aria-label="Authentication method">
              <button
                type="button"
                className={authType === 'kubeconfig' ? 'active' : ''}
                onClick={() => setAuthType('kubeconfig')}
              >
                Kubeconfig file
              </button>
              <button
                type="button"
                className={authType === 'token' ? 'active' : ''}
                onClick={() => setAuthType('token')}
                data-testid="auth-token"
              >
                Bearer token
              </button>
            </div>
          </Field>
        </div>

        <Field
          label={authType === 'token' ? 'API server URL' : 'API server URL (optional)'}
          htmlFor="cluster-server"
          hint={
            authType === 'token'
              ? 'The Kubernetes API endpoint, usually port 6443.'
              : 'Only used for display — the server comes from the kubeconfig file.'
          }
        >
          <input
            id="cluster-server"
            data-testid="cluster-server"
            className="text-input"
            value={server}
            onChange={(event) => setServer(event.target.value)}
            placeholder="https://10.0.0.10:6443"
            spellCheck={false}
          />
        </Field>

        {authType === 'kubeconfig' ? (
          <>
            <Field
              label="Kubeconfig path"
              htmlFor="cluster-kubeconfig"
              hint="Path on this machine. Exec-based credentials (EKS, GKE, AKS) are supported."
            >
              <input
                id="cluster-kubeconfig"
                data-testid="cluster-kubeconfig"
                className="text-input font-mono"
                value={kubeconfigPath}
                onChange={(event) => setKubeconfigPath(event.target.value)}
                placeholder="~/.kube/config"
                spellCheck={false}
              />
            </Field>
            <Field
              label="Context (optional)"
              htmlFor="cluster-context"
              hint="Leave blank to use the kubeconfig's current context."
            >
              <input
                id="cluster-context"
                data-testid="cluster-context"
                className="text-input font-mono"
                value={kubeconfigContext}
                onChange={(event) => setKubeconfigContext(event.target.value)}
                placeholder="my-context"
                spellCheck={false}
              />
            </Field>
          </>
        ) : (
          <>
            <Field
              label="Bearer token"
              htmlFor="cluster-token"
              hint={
                cluster?.hasToken
                  ? 'A token is already stored. Leave this blank to keep it.'
                  : 'A service account or user token with permission to list pods.'
              }
            >
              <div className="relative">
                <input
                  id="cluster-token"
                  data-testid="cluster-token"
                  className="text-input pr-10"
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder={cluster?.hasToken ? '••••••••••••  (stored)' : 'eyJhbGciOi…'}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowToken((value) => !value)}
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </Field>

            <Field
              label="CA certificate (optional)"
              htmlFor="cluster-ca"
              hint="PEM-encoded CA bundle. Leave blank to use the system trust store."
            >
              <textarea
                id="cluster-ca"
                className="text-input font-mono"
                rows={3}
                value={caCert}
                onChange={(event) => setCaCert(event.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----"
                spellCheck={false}
              />
            </Field>

            <label className="check-row">
              <input
                type="checkbox"
                data-testid="skip-tls"
                checked={skipTlsVerify}
                onChange={(event) => setSkipTlsVerify(event.target.checked)}
              />
              <span className="flex flex-col gap-0.5">
                <strong>Skip TLS verification</strong>
                <span className="check-hint">
                  Only for clusters with self-signed certificates you trust.
                </span>
              </span>
            </label>
          </>
        )}

        {testResult && (
          <div className={`test-result ${testResult.ok ? 'ok' : 'error'}`} role="status">
            {testResult.ok ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
            <div className="flex min-w-0 flex-col gap-0.5">
              <strong>
                {testResult.ok
                  ? `Connected · ${formatVersion(testResult.version)}`
                  : 'Connection failed'}
              </strong>
              <span>
                {testResult.ok
                  ? `${formatLatency(testResult.latencyMs ?? 0)} round-trip`
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
