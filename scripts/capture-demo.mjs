import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import electronPath from 'electron'
import { _electron as electron } from 'playwright-core'

const cwd = process.cwd()
const imagesDir = join(cwd, 'docs', 'images')
const userDataDir = mkdtempSync(join(tmpdir(), 'servermon-demo-'))
const children = []
let electronApp = null

const SERVERS = [
  { port: 16443, version: 'v1.29.8', profile: 'full', token: 'eu-token' },
  { port: 16444, version: 'v1.31.4', profile: 'full', token: 'us-token' },
  { port: 16445, version: 'v1.35.1', profile: 'healthy', token: 'staging-token' }
]

function startMock(server) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/mock-k8s-server.mjs'], {
      cwd,
      env: {
        ...process.env,
        MOCK_PORT: String(server.port),
        MOCK_VERSION: server.version,
        MOCK_PROFILE: server.profile,
        MOCK_TOKEN: server.token
      },
      stdio: ['ignore', 'pipe', 'inherit']
    })
    children.push(child)

    let buffer = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Mock server on port ${server.port} did not start.`))
    }, 10_000)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      if (buffer.includes('listening on')) {
        clearTimeout(timer)
        resolve(child)
      }
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Mock server on port ${server.port} exited with code ${code}.`))
    })
  })
}

async function waitForToastsGone(page) {
  await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0, null, {
    timeout: 15_000
  })
}

async function neutralMouse(page) {
  await page.mouse.move(700, 820)
}

async function addTokenCluster(page, { name, port, token }) {
  await page.getByTestId('nav-k8s-clusters').click()
  await page.getByTestId('add-cluster').click()
  await page.getByTestId('cluster-name').fill(name)
  await page.getByTestId('auth-token').click()
  await page.getByTestId('cluster-server').fill(`http://127.0.0.1:${port}`)
  await page.getByTestId('cluster-token').fill(token)
  await page.getByTestId('skip-tls').check()
  await page.getByTestId('save-cluster').click()
  await page.locator('.config-name', { hasText: name }).waitFor({ timeout: 10_000 })
}

async function addKubeconfigCluster(page, { name, path, context }) {
  await page.getByTestId('nav-k8s-clusters').click()
  await page.getByTestId('add-cluster').click()
  await page.getByTestId('cluster-name').fill(name)
  await page.getByTestId('cluster-kubeconfig').fill(path)
  await page.getByTestId('cluster-context').fill(context)
  await page.getByTestId('save-cluster').click()
  await page.locator('.config-name', { hasText: name }).waitFor({ timeout: 10_000 })
}

async function main() {
  mkdirSync(imagesDir, { recursive: true })
  for (const server of SERVERS) {
    await startMock(server)
  }
  console.log('▸ mock clusters ready')

  const kubeconfigPath = join(userDataDir, 'staging-kubeconfig.yaml')
  writeFileSync(
    kubeconfigPath,
    [
      'apiVersion: v1',
      'kind: Config',
      'clusters:',
      '- name: staging',
      '  cluster:',
      '    server: http://127.0.0.1:16445',
      '    insecure-skip-tls-verify: true',
      'users:',
      '- name: staging-user',
      '  user:',
      '    token: staging-token',
      'contexts:',
      '- name: staging',
      '  context:',
      '    cluster: staging',
      '    user: staging-user',
      'current-context: staging',
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
  await page.waitForLoadState('domcontentloaded')
  await page.getByTestId('nav-k8s-clusters').waitFor()

  await addTokenCluster(page, { name: 'prod-eu-west', port: 16443, token: 'eu-token' })
  await addTokenCluster(page, { name: 'prod-us-east', port: 16444, token: 'us-token' })
  await addKubeconfigCluster(page, {
    name: 'staging-ap-south',
    path: kubeconfigPath,
    context: 'staging'
  })

  await page.locator('.config-table').waitFor()
  await page.getByText('v1.29.8').waitFor({ timeout: 20_000 })
  await page.getByText('v1.31.4').waitFor({ timeout: 20_000 })
  await page.getByText('v1.35.1').waitFor({ timeout: 20_000 })
  await waitForToastsGone(page)
  await neutralMouse(page)
  await page.screenshot({ path: join(imagesDir, 'clusters.png') })
  console.log('✓ clusters.png')

  // Add-cluster dialog with realistic demo values (not saved).
  await page.getByTestId('add-cluster').click()
  await page.getByTestId('cluster-name').fill('prod-ap-south')
  await page.getByTestId('auth-token').click()
  await page.getByTestId('cluster-server').fill('https://10.20.0.10:6443')
  await page.getByTestId('cluster-token').fill('demo-service-account-token')
  await neutralMouse(page)
  await page.screenshot({ path: join(imagesDir, 'add-cluster.png') })
  await page.getByRole('button', { name: 'Cancel' }).click()
  console.log('✓ add-cluster.png')

  // Dashboard with multiple clusters.
  await page.getByTestId('nav-k8s-pods').click()
  await page.getByTestId('cluster-tab').filter({ hasText: 'prod-us-east' }).click()
  await page.locator('.overview-title-row h1', { hasText: 'prod-us-east' }).waitFor()
  await page.getByTestId('pod-row').first().waitFor({ timeout: 15_000 })
  await waitForToastsGone(page)
  await neutralMouse(page)
  await page.screenshot({ path: join(imagesDir, 'dashboard.png') })
  console.log('✓ dashboard.png')

  // Settings, cropped to the monitoring panel so the README image stays focused.
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('update-status').waitFor({ timeout: 10_000 })
  await waitForToastsGone(page)
  const formBox = await page.getByTestId('settings-form').boundingBox()
  const clipHeight = Math.min(870, Math.ceil((formBox?.y ?? 80) + (formBox?.height ?? 400) + 8))
  await page.screenshot({
    path: join(imagesDir, 'settings.png'),
    clip: { x: 224, y: 0, width: 1216, height: clipHeight }
  })
  console.log('✓ settings.png')

  // Responsive layout.
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setSize(1100, 800)
  )
  await delay(400)
  await page.getByTestId('nav-k8s-pods').click()
  await page.getByTestId('pod-row').first().waitFor({ timeout: 15_000 })
  await waitForToastsGone(page)
  await neutralMouse(page)
  await page.screenshot({ path: join(imagesDir, 'responsive.png') })
  console.log('✓ responsive.png')

  console.log('\nDemo screenshots written to docs/images')
}

try {
  await main()
} catch (error) {
  console.error('Demo capture failed:', error)
  process.exitCode = 1
} finally {
  if (electronApp) await electronApp.close().catch(() => undefined)
  for (const child of children) child.kill('SIGTERM')
  rmSync(userDataDir, { recursive: true, force: true })
}
