import type { DatabaseSync } from 'node:sqlite'
import type { AuthType } from '@shared/types'
import type { ClusterRepository } from '../application/ports'
import {
  ClusterNotFoundError,
  DuplicateClusterNameError,
  type ClusterDraft,
  type ClusterEntity
} from '../domain/cluster'

interface ClusterRow {
  id: number
  name: string
  server: string
  auth_type: AuthType
  kubeconfig_path: string | null
  kubeconfig_context: string | null
  token: string | null
  ca_cert: string | null
  skip_tls_verify: number
  created_at: string
  updated_at: string
}

function toEntity(row: ClusterRow): ClusterEntity {
  return {
    id: row.id,
    name: row.name,
    server: row.server,
    authType: row.auth_type,
    kubeconfigPath: row.kubeconfig_path,
    kubeconfigContext: row.kubeconfig_context,
    caCert: row.ca_cert,
    skipTlsVerify: row.skip_tls_verify === 1,
    token: row.token,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function translateSqliteError(error: unknown, name: string): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (/UNIQUE constraint failed: clusters\.name/i.test(message)) {
    return new DuplicateClusterNameError(name)
  }
  return error instanceof Error ? error : new Error(message)
}

/** SQLite adapter. Contains only persistence concerns — no validation or HTTP logic. */
export class SqliteClusterRepository implements ClusterRepository {
  constructor(private readonly db: DatabaseSync) {}

  findAll(): ClusterEntity[] {
    const rows = this.db
      .prepare('SELECT * FROM clusters ORDER BY name COLLATE NOCASE')
      .all() as unknown as ClusterRow[]
    return rows.map(toEntity)
  }

  findById(id: number): ClusterEntity | null {
    const row = this.db.prepare('SELECT * FROM clusters WHERE id = ?').get(id) as unknown as
      | ClusterRow
      | undefined
    return row ? toEntity(row) : null
  }

  insert(cluster: ClusterDraft): ClusterEntity {
    try {
      const result = this.db
        .prepare(
          `INSERT INTO clusters
            (name, server, auth_type, kubeconfig_path, kubeconfig_context, token, ca_cert, skip_tls_verify, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          cluster.name,
          cluster.server,
          cluster.authType,
          cluster.kubeconfigPath,
          cluster.kubeconfigContext,
          cluster.token,
          cluster.caCert,
          cluster.skipTlsVerify ? 1 : 0,
          cluster.createdAt,
          cluster.updatedAt
        )

      const created = this.findById(Number(result.lastInsertRowid))
      if (!created) throw new Error('Failed to read back the created cluster.')
      return created
    } catch (error) {
      throw translateSqliteError(error, cluster.name)
    }
  }

  update(id: number, cluster: ClusterDraft): void {
    try {
      const result = this.db
        .prepare(
          `UPDATE clusters SET
             name = ?, server = ?, auth_type = ?, kubeconfig_path = ?, kubeconfig_context = ?,
             token = ?, ca_cert = ?, skip_tls_verify = ?, created_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          cluster.name,
          cluster.server,
          cluster.authType,
          cluster.kubeconfigPath,
          cluster.kubeconfigContext,
          cluster.token,
          cluster.caCert,
          cluster.skipTlsVerify ? 1 : 0,
          cluster.createdAt,
          cluster.updatedAt,
          id
        )
      if (result.changes === 0) throw new ClusterNotFoundError()
    } catch (error) {
      throw translateSqliteError(error, cluster.name)
    }
  }

  delete(id: number): void {
    const result = this.db.prepare('DELETE FROM clusters WHERE id = ?').run(id)
    if (result.changes === 0) throw new ClusterNotFoundError()
  }
}
