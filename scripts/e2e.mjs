import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'
import electronPath from 'electron'
import { _electron as electron } from 'playwright-core'

const cwd = process.cwd()
const screenshotsDir = join(cwd, 'screenshots')
mkdirSync(screenshotsDir, { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'servermon-e2e-'))

let mockServer = null
let electronApp = null

function startMockServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/mock-k8s-server.mjs'], {
      cwd,
      stdio: ['ignore', 'pipe', 'inherit']
    })
    let buffer = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Mock Kubernetes API server did not start in time.'))
    }, 10_000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      const match = buffer.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      if (match) {
        clearTimeout(timer)
        resolve({ child, port: Number(match[1]) })
      }
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Mock server exited early with code ${code}.`))
    })
  })
}

async function waitForRowCount(page, expected, timeoutMs = 20_000) {
  const started = Date.now()
  let last = -1
  while (Date.now() - started < timeoutMs) {
    last = await page.getByTestId('pod-row').count()
    if (last === expected) return
    await delay(120)
  }
  throw new Error(`Expected ${expected} pod rows, but found ${last}.`)
}

async function main() {
  const started = await startMockServer()
  mockServer = started.child
  const baseUrl = `http://127.0.0.1:${started.port}`
  console.log(`▸ mock k8s API: ${baseUrl}`)

  const kubeconfigPath = join(userDataDir, 'mock-kubeconfig.yaml')
  writeFileSync(
    kubeconfigPath,
    [
      'apiVersion: v1',
      'kind: Config',
      'clusters:',
      '- name: mock',
      '  cluster:',
      `    server: ${baseUrl}`,
      '    insecure-skip-tls-verify: true',
      'users:',
      '- name: mock-user',
      '  user:',
      '    token: test-token',
      'contexts:',
      '- name: mock-ctx',
      '  context:',
      '    cluster: mock',
      '    user: mock-user',
      'current-context: mock-ctx',
      ''
    ].join('\n')
  )

  electronApp = await electron.launch({
    executablePath: electronPath,
    args: ['.'],
    env: { ...process.env, SERVERMON_USER_DATA: userDataDir },
    timeout: 60_000
  })

  const page = await electronApp.firstWindow()
  page.on('pageerror', (error) => console.error('[page error]', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[renderer]', message.text())
  })

  await page.waitForLoadState('domcontentloaded')
  await page.getByTestId('nav-k8s-clusters').waitFor()
  await page.screenshot({ path: join(screenshotsDir, '01-empty.png') })

  // Add a token-authenticated cluster through the config page.
  await page.getByTestId('nav-k8s-clusters').click()
  await page.getByTestId('add-cluster').click()
  await page.getByTestId('cluster-name').fill('mock-prod')
  await page.getByTestId('auth-token').click()
  await page.getByTestId('cluster-server').fill(baseUrl)
  await page.getByTestId('cluster-token').fill('test-token')
  // The mock API speaks plain HTTP; client-node requires this to be explicit.
  await page.getByTestId('skip-tls').check()

  await page.getByTestId('test-cluster').click()
  await page.getByText('Connected · v1.31.4').waitFor({ timeout: 15_000 })
  await page.screenshot({ path: join(screenshotsDir, '02-add-cluster.png') })

  await page.getByTestId('save-cluster').click()
  await page.locator('.config-name', { hasText: 'mock-prod' }).waitFor({ timeout: 10_000 })
  await page.locator('.config-table').waitFor()
  await page.screenshot({ path: join(screenshotsDir, '03-clusters.png') })
  console.log('✓ cluster created via config page')

  // Dashboard: pods from the mock API, completed pods hidden by default.
  await page.getByTestId('nav-k8s-pods').click()
  await page.getByTestId('pod-row').first().waitFor({ timeout: 15_000 })
  await waitForRowCount(page, 7)

  for (const status of [
    'Running',
    'CrashLoopBackOff',
    'ContainerCreating',
    'ImagePullBackOff',
    'OOMKilled',
    'Terminating'
  ]) {
    await page.getByText(status, { exact: true }).first().waitFor()
  }
  // Terminating pods are shown but not counted as issues.
  await page.getByText('4 issues', { exact: true }).first().waitFor()
  await page.screenshot({ path: join(screenshotsDir, '04-dashboard.png') })
  console.log('✓ pod table renders statuses from the API')

  // Search filter.
  await page.getByTestId('pod-search').fill('grafana')
  await waitForRowCount(page, 1)
  await page.getByTestId('pod-search').fill('')
  await waitForRowCount(page, 7)

  // Issues-only filter leaves the four non-healthy pods.
  await page.getByRole('button', { name: /Only issues/ }).click()
  await waitForRowCount(page, 4)
  await page.getByRole('button', { name: /Only issues/ }).click()
  await waitForRowCount(page, 7)

  // Completed pods toggle.
  await page.getByRole('button', { name: /Show completed/ }).click()
  await waitForRowCount(page, 8)
  await page.getByRole('button', { name: /Show completed/ }).click()
  await waitForRowCount(page, 7)
  console.log('✓ filters work')

  // Auto-refresh: wait beyond the 5s interval and confirm another pods request hit the API.
  const before = await fetch(`${baseUrl}/stats`).then((response) => response.json())
  await delay(6_000)
  const after = await fetch(`${baseUrl}/stats`).then((response) => response.json())
  assert.ok(
    after.podsRequests > before.podsRequests,
    `Expected auto-refresh requests (before=${before.podsRequests}, after=${after.podsRequests}).`
  )
  console.log(`✓ auto-refresh polling (${before.podsRequests} → ${after.podsRequests} requests)`)

  // Add a second cluster backed by a kubeconfig file with a selected context.
  await page.getByTestId('nav-k8s-clusters').click()
  await page.getByTestId('add-cluster').click()
  await page.getByTestId('cluster-name').fill('mock-kubeconfig')
  await page.getByTestId('cluster-kubeconfig').fill(kubeconfigPath)
  await page.getByTestId('cluster-context').fill('mock-ctx')
  await page.getByTestId('test-cluster').click()
  await page.getByText('Connected · v1.31.4', { exact: true }).waitFor({ timeout: 15_000 })
  await page.getByTestId('save-cluster').click()
  await page.locator('.config-name', { hasText: 'mock-kubeconfig' }).waitFor({ timeout: 10_000 })
  console.log('✓ kubeconfig cluster created')

  // Both tabs poll independently; switching tabs shows the other cluster.
  await page.getByTestId('nav-k8s-pods').click()
  assert.equal(await page.getByTestId('cluster-tab').count(), 2)
  await page.getByTestId('cluster-tab').filter({ hasText: 'mock-kubeconfig' }).click()
  await page.locator('.overview-title-row h1', { hasText: 'mock-kubeconfig' }).waitFor()
  await page.getByTestId('pod-row').first().waitFor({ timeout: 15_000 })
  await waitForRowCount(page, 7)
  await page.screenshot({ path: join(screenshotsDir, '05-dashboard-multi.png') })
  console.log('✓ multiple cluster tabs')

  // Responsive layout: below the sidebar breakpoint it collapses to icons.
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1100, 800)
  )
  await delay(350)
  const sidebarWidth = await page.evaluate(
    () => document.querySelector('aside')?.getBoundingClientRect().width ?? 0
  )
  assert.ok(sidebarWidth < 100, `Expected collapsed sidebar, got ${sidebarWidth}px.`)
  await page.screenshot({ path: join(screenshotsDir, '07-collapsed-sidebar.png') })
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900)
  )
  await delay(250)
  console.log('✓ responsive sidebar')

  // Multi-module navigation: Alibaba Cloud placeholder and back.
  await page.getByTestId('nav-aliyun-ecs').click()
  await page
    .getByRole('heading', { name: 'Alibaba Cloud monitoring is not wired up yet' })
    .waitFor()
  await page.screenshot({ path: join(screenshotsDir, '06-aliyun-placeholder.png') })
  await page.getByTestId('nav-k8s-pods').click()
  await page.locator('.overview-title-row h1', { hasText: 'mock-kubeconfig' }).waitFor()
  console.log('✓ module navigation')

  // Update the first cluster.
  await page.getByTestId('nav-k8s-clusters').click()
  const row = page.locator('tr', { hasText: 'mock-prod' }).first()
  await row.getByRole('button', { name: /Edit/ }).click()
  await page.getByTestId('cluster-name').fill('mock-prod-renamed')
  await page.getByTestId('save-cluster').click()
  await page.locator('.config-name', { hasText: 'mock-prod-renamed' }).waitFor()
  console.log('✓ cluster updated')

  // Delete both clusters.
  for (const name of ['mock-prod-renamed', 'mock-kubeconfig']) {
    const targetRow = page.locator('tr', { hasText: name })
    await targetRow.getByRole('button', { name: /Remove/ }).click()
    await page.getByTestId('confirm-delete').click()
    await page.locator('.config-name', { hasText: name }).waitFor({ state: 'detached' })
  }
  await page.getByText('No clusters yet').waitFor({ timeout: 10_000 })
  console.log('✓ clusters removed')

  // Settings: interval persists and drives the live refresh label.
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('update-status').waitFor({ timeout: 10_000 })
  assert.equal(await page.getByTestId('refresh-interval').inputValue(), '5')
  assert.equal(await page.getByTestId('check-updates').isDisabled(), true)
  assert.match(await page.getByTestId('update-status').innerText(), /packaged builds/)
  await page.screenshot({ path: join(screenshotsDir, '08-settings.png') })

  await page.getByTestId('refresh-interval').fill('2')
  await page.getByTestId('save-settings').click()
  await page.getByText('Refresh interval set to 2s.').waitFor()
  await page.locator('.live-pill').filter({ hasText: 'Live · 2s' }).waitFor()
  console.log('✓ settings refresh interval updated')

  // The migration runner must record applied versions in schema_migrations.
  const db = new DatabaseSync(join(userDataDir, 'servermon.db'), { readOnly: true })
  const migrations = db
    .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
    .all()
  const setting = db
    .prepare("SELECT value FROM settings WHERE key = 'refresh_interval_seconds'")
    .get()
  db.close()
  assert.deepEqual(
    migrations.map((migration) => Number(migration.version)),
    [1, 2]
  )
  assert.equal(migrations[0].name, 'create_clusters')
  assert.equal(migrations[1].name, 'create_settings')
  assert.equal(setting.value, '2')
  console.log('✓ schema migrations and settings persisted')

  console.log('\nE2E passed. Screenshots in ./screenshots')
}

try {
  await main()
} catch (error) {
  console.error('\nE2E failed:', error)
  if (electronApp) {
    const page = electronApp.windows()[0]
    if (page) {
      await page
        .screenshot({ path: join(screenshotsDir, 'failure.png') })
        .catch(() => undefined)
    }
  }
  process.exitCode = 1
} finally {
  if (electronApp) await electronApp.close().catch(() => undefined)
  if (mockServer) mockServer.kill('SIGTERM')
  rmSync(userDataDir, { recursive: true, force: true })
}
