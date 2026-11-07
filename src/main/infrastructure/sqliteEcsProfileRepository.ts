import type { DatabaseSync } from 'node:sqlite'
import type { EcsProfileRepository } from '../application/ports'
import {
  DuplicateEcsProfileNameError,
  EcsProfileNotFoundError,
  type EcsProfileDraft,
  type EcsProfileEntity
} from '../domain/ecsProfile'

interface EcsProfileRow {
  id: number
  name: string
  region_id: string
  access_key_id: string
  access_key_secret: string | null
  endpoint: string | null
  created_at: string
  updated_at: string
}

function toEntity(row: EcsProfileRow): EcsProfileEntity {
  return {
    id: row.id,
    name: row.name,
    regionId: row.region_id,
    accessKeyId: row.access_key_id,
    accessKeySecret: row.access_key_secret,
    endpoint: row.endpoint,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function translateSqliteError(error: unknown, name: string): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (/UNIQUE constraint failed: ecs_profiles\.name/i.test(message)) {
    return new DuplicateEcsProfileNameError(name)
  }
  return error instanceof Error ? error : new Error(message)
}

/** SQLite adapter. Contains only persistence concerns — no validation or HTTP logic. */
export class SqliteEcsProfileRepository implements EcsProfileRepository {
  constructor(private readonly db: DatabaseSync) {}

  findAll(): EcsProfileEntity[] {
    const rows = this.db
      .prepare('SELECT * FROM ecs_profiles ORDER BY name COLLATE NOCASE')
      .all() as unknown as EcsProfileRow[]
    return rows.map(toEntity)
  }

  findById(id: number): EcsProfileEntity | null {
    const row = this.db.prepare('SELECT * FROM ecs_profiles WHERE id = ?').get(id) as unknown as
      | EcsProfileRow
      | undefined
    return row ? toEntity(row) : null
  }

  insert(profile: EcsProfileDraft): EcsProfileEntity {
    try {
      const result = this.db
        .prepare(
          `INSERT INTO ecs_profiles
            (name, region_id, access_key_id, access_key_secret, endpoint, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          profile.name,
          profile.regionId,
          profile.accessKeyId,
          profile.accessKeySecret,
          profile.endpoint,
          profile.createdAt,
          profile.updatedAt
        )

      const created = this.findById(Number(result.lastInsertRowid))
      if (!created) throw new Error('Failed to read back the created profile.')
      return created
    } catch (error) {
      throw translateSqliteError(error, profile.name)
    }
  }

  update(id: number, profile: EcsProfileDraft): void {
    try {
      const result = this.db
        .prepare(
          `UPDATE ecs_profiles SET
             name = ?, region_id = ?, access_key_id = ?, access_key_secret = ?, endpoint = ?,
             created_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          profile.name,
          profile.regionId,
          profile.accessKeyId,
          profile.accessKeySecret,
          profile.endpoint,
          profile.createdAt,
          profile.updatedAt,
          id
        )
      if (result.changes === 0) throw new EcsProfileNotFoundError()
    } catch (error) {
      throw translateSqliteError(error, profile.name)
    }
  }

  delete(id: number): void {
    const result = this.db.prepare('DELETE FROM ecs_profiles WHERE id = ?').run(id)
    if (result.changes === 0) throw new EcsProfileNotFoundError()
  }
}
