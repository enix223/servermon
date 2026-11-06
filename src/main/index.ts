import { app, BrowserWindow, shell } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { ClusterService } from './application/clusterService'
import { ConnectionTester } from './application/connectionTester'
import { SettingsService } from './application/settingsService'
import { openSqliteDatabase } from './infrastructure/sqliteDatabase'
import { SqliteClusterRepository } from './infrastructure/sqliteClusterRepository'
import { SqliteSettingsRepository } from './infrastructure/sqliteSettingsRepository'
import { KubernetesClusterMonitor } from './infrastructure/kubernetesClusterMonitor'
import { ElectronUpdater } from './infrastructure/electronUpdater'
import { registerIpcHandlers } from './ipc'

app.setName('ServerMon')

// Useful for portable installs and for the end-to-end test harness.
if (process.env.SERVERMON_USER_DATA) {
  app.setPath('userData', process.env.SERVERMON_USER_DATA)
}

let database: DatabaseSync | null = null

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    show: false,
    backgroundColor: '#080b10',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  window.once('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

/**
 * Composition root: the only place that knows about concrete implementations.
 * Swapping SQLite for Postgres (or IPC for HTTP, in a web build) happens here
 * and in the renderer's API adapter — not in the pages.
 */
app.whenReady().then(() => {
  database = openSqliteDatabase(app.getPath('userData'))
  const clusterRepository = new SqliteClusterRepository(database)
  const settingsRepository = new SqliteSettingsRepository(database)
  const monitor = new KubernetesClusterMonitor()
  const updater = new ElectronUpdater()

  registerIpcHandlers({
    clusterService: new ClusterService(clusterRepository),
    connectionTester: new ConnectionTester(clusterRepository, monitor),
    settingsService: new SettingsService(settingsRepository),
    monitor,
    updater
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  database?.close()
  database = null
})
