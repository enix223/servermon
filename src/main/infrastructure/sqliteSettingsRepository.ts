import type { DatabaseSync } from 'node:sqlite'
import type { SettingsRepository } from '../application/ports'

/** Settings adapter: a small key/value table with upsert support. */
export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: DatabaseSync) {}

  getAll(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as unknown as {
      key: string
      value: string
    }[]
    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
  }

  set(values: Record<string, string>): void {
    const statement = this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    const now = new Date().toISOString()

    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const [key, value] of Object.entries(values)) {
        statement.run(key, value, now)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        // Preserve the original error.
      }
      throw error
    }
  }
}
