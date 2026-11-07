import { readFileSync } from 'node:fs'

/**
 * Integrity check: verifies that the source files contain the exact strings
 * the implementation depends on. Run after editing files with tooling that may
 * silently drop characters.
 */

const checks = [
  ['src/main/infrastructure/aliyunOpenApiClient.ts', [
    "export function percentEncode(value: string): string {",
    "return encodeURIComponent(value).replace(",
    "/[!'()*]/g,",
    "export function signRequest(",
    "createHmac('sha1', `${accessKeySecret}&`)",
    "export function formatTimestamp(date: Date): string {",
    "return date.toISOString().replace(/\\.\\d{3}Z$/, 'Z')",
    "SignatureMethod: SIGNATURE_METHOD,",
    "SignatureVersion: SIGNATURE_VERSION,",
    "Timestamp: formatTimestamp(new Date()),",
    "query.Signature = signRequest('GET', query, this.credentials.accessKeySecret)",
    "return `https://ecs.${this.options.regionId}.aliyuncs.com`"
  ]],
  ['src/main/infrastructure/aliyunEcsMonitor.ts', [
    "const PAGE_SIZE = 100",
    "async testConnection(profile: EcsProfileEntity): Promise<EcsConnectionTestResult> {",
    "async listInstances(profile: EcsProfileEntity): Promise<EcsInstancesResult> {",
    "client.request<DescribeInstancesResponse>(",
    "'DescribeInstances',",
    "params.NextToken = nextToken",
    "params.PageNumber = pageNumber"
  ]],
  ['src/main/domain/ecsProfile.ts', [
    "const REGION_PATTERN = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/",
    "export function normalizeEndpoint(endpoint: string | null | undefined): string | null {",
    "const hostname = url.hostname.replace(/^\\[|\\]$/g, '')",
    "hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'",
    "export function defaultEcsEndpoint(regionId: string): string {"
  ]],
  ['src/main/infrastructure/sqliteDatabase.ts', [
    "name: 'create_ecs_profiles',",
    "CREATE TABLE IF NOT EXISTS ecs_profiles (",
    "access_key_secret TEXT,",
    "name: 'seed_ecs_refresh_interval',",
    "ecs_refresh_interval_seconds"
  ]],
  ['src/main/ipc.ts', [
    "ipcMain.handle('ecs:profiles:list'",
    "ipcMain.handle('ecs:profiles:create'",
    "ipcMain.handle('ecs:profiles:update'",
    "ipcMain.handle('ecs:profiles:delete'",
    "ipcMain.handle('ecs:profiles:test'",
    "ipcMain.handle('ecs:instances:list'"
  ]],
  ['src/preload/index.ts', [
    "listEcsProfiles: () => ipcRenderer.invoke('ecs:profiles:list')",
    "listEcsInstances: (profileId: number) => ipcRenderer.invoke('ecs:instances:list', profileId)"
  ]],
  ['src/renderer/src/lib/ecs.ts', [
    "export function ecsStatusTone(status: string): Tone {",
    "export function computeEcsStats(instances: EcsInstanceInfo[]): EcsStats {",
    "export function formatMemory(memoryMiB: number): string {",
    "'cn-hangzhou',"
  ]],
  ['src/renderer/src/lib/useEcsMonitor.ts', [
    "export function useEcsMonitor({",
    "export interface EcsMonitorState {"
  ]],
  ['src/renderer/src/components/EcsProfileForm.tsx', [
    "data-testid=\"ecs-profile-name\"",
    "data-testid=\"ecs-profile-region\"",
    "data-testid=\"ecs-profile-access-key-id\"",
    "data-testid=\"ecs-profile-access-key-secret\"",
    "data-testid=\"ecs-profile-endpoint\"",
    "data-testid=\"test-ecs-profile\"",
    "data-testid=\"save-ecs-profile\""
  ]],
  ['src/renderer/src/components/EcsInstanceTable.tsx', [
    "data-testid=\"ecs-instance-row\"",
    "formatMemory(instance.memoryMiB)"
  ]],
  ['src/renderer/src/App.tsx', [
    "const ecs = useEcsMonitor({",
    "refreshIntervalSeconds: settings.ecsRefreshIntervalSeconds",
    "<EcsProfileTabs",
    "<EcsInstancesView",
    "<EcsProfilesPage",
    "ecs.refreshAll()"
  ]],
  ['scripts/mock-aliyun-ecs-server.mjs', [
    "const ACCESS_KEY_ID = process.env.MOCK_ACCESS_KEY_ID || 'test-access-key-id'",
    "const ACCESS_KEY_SECRET = process.env.MOCK_ACCESS_KEY_SECRET || 'test-access-key-secret'",
    "function expectedSignature(params) {",
    "createHmac('sha1', `${ACCESS_KEY_SECRET}&`)",
    "Code: 'SignatureDoesNotMatch'",
    "Code: 'InvalidAccessKeyId.NotFound'"
  ]],
  ['scripts/e2e.mjs', [
    "await page.getByTestId('ecs-profile-name').fill('mock-aliyun')",
    "await page.getByTestId('ecs-profile-access-key-id').fill(MOCK_ACCESS_KEY_ID)",
    "await page.getByTestId('ecs-profile-access-key-secret').fill(MOCK_ACCESS_KEY_SECRET)",
    "const instanceRows = page.locator('[data-testid=\"ecs-instance-row\"]')",
    "assert.equal(ecsStats.badSignature, 0, 'Expected no signature mismatches.')",
    "assert.equal(await page.getByTestId('ecs-profile-tab').count(), 2)",
    "[1, 2, 3, 4]",
    "await page.getByTestId('refresh-interval').inputValue(), '5'",
    "await page.getByTestId('check-updates').isDisabled(), true",
    "await page.getByText(/Update checks run in packaged builds/).first().waitFor({",
    "await page.getByTestId('refresh-interval').fill('2')",
    ".filter({ hasText: 'Live · 2s' }).waitFor()"
  ]]
]

let failures = 0
for (const [file, needles] of checks) {
  let source
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    console.log(`FAIL  ${file} (missing)`)
    failures += 1
    continue
  }
  const missing = needles.filter((needle) => !source.includes(needle))
  if (missing.length > 0) {
    failures += missing.length
    console.log(`FAIL  ${file} :: ${missing.length} needle(s) missing`)
    for (const needle of missing) {
      console.log(`      >>> ${needle.length} chars :: ${needle.slice(0, 48)}`)
    }
  } else {
    console.log(`PASS  ${file} (${needles.length})`)
  }
}

console.log(failures === 0 ? '\nIntegrity check passed.' : `\nIntegrity check FAILED (${failures}).`)
process.exitCode = failures === 0 ? 0 : 1
