import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Ordered, forward-only schema migrations.
 *
 * Rules:
 *  - Never edit a migration that has shipped; add a new one with the next version.
 *  - Each migration runs inside its own transaction and is recorded in
 *    `schema_migrations`; a failed migration is rolled back and retried on the
 *    next launch.
 *  - Migrations may create tables, alter tables, backfill data, or add indexes.
 *
 * Example for a future release:
 *   {
 *     version: 2,
 *     name: 'create_aliyun_accounts',
 *     up: (db) => db.exec(`CREATE TABLE aliyun_accounts (...);`)
 *   }
 */
interface Migration {
  version: number
  name: string
  up: (db: DatabaseSync) => void
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'create_clusters',
    up: (db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS clusters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          server TEXT NOT NULL DEFAULT '',
          auth_type TEXT NOT NULL CHECK (auth_type IN ('kubeconfig', 'token')),
          kubeconfig_path TEXT,
          kubeconfig_context TEXT,
          token TEXT,
          ca_cert TEXT,
          skip_tls_verify INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
  },
  {
    version: 2,
    name: 'create_settings',
    up: (db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT OR IGNORE INTO settings (key, value, updated_at)
        VALUES ('refresh_interval_seconds', '5', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      `)
  }
]

function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)
}

function migrate(db: DatabaseSync): void {
  ensureMigrationsTable(db)

  const versions = new Set(MIGRATIONS.map((migration) => migration.version))
  if (versions.size !== MIGRATIONS.length) {
    throw new Error('Duplicate migration version numbers detected.')
  }

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as unknown as {
    version: number
  }[]
  const applied = new Set(appliedRows.map((row) => Number(row.version)))
  const pending = MIGRATIONS.filter((migration) => !applied.has(migration.version)).sort(
    (a, b) => a.version - b.version
  )

  for (const migration of pending) {
    let inTransaction = false
    try {
      db.exec('BEGIN IMMEDIATE')
      inTransaction = true
      migration.up(db)
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
      ).run(migration.version, migration.name, new Date().toISOString())
      db.exec('COMMIT')
      inTransaction = false
    } catch (error) {
      if (inTransaction) {
        try {
          db.exec('ROLLBACK')
        } catch {
          // Preserve the original migration error.
        }
      }
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Database migration ${migration.version} (${migration.name}) failed: ${detail}`,
        { cause: error }
      )
    }
  }
}

export function openSqliteDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, 'servermon.db')
  const db = new DatabaseSync(file)

  // The bearer tokens live in this file; keep it private to the current user.
  try {
    chmodSync(file, 0o600)
  } catch {
    // Best effort (e.g. network home directories).
  }

  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  migrate(db)
  return db
}
