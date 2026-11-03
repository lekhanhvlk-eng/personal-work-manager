import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

export const DATABASE_URL = process.env.TEST_DATABASE_URL ?? ''

const root = join(__dirname, '..', '..')

/** Tạo lại schema sạch: drop public/auth, áp stub Supabase + toàn bộ migration. */
export async function resetDatabase(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    await client.query(
      'drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;',
    )
    await client.query(readFileSync(join(root, 'tests/db/supabase-stub.sql'), 'utf8'))
    const dir = join(root, 'supabase/migrations')
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      await client.query(readFileSync(join(dir, file), 'utf8'))
    }
  } finally {
    await client.end()
  }
}

/** Kết nối đóng vai trò người dùng đã đăng nhập (role authenticated + JWT sub). */
export class UserSession {
  private constructor(
    public readonly client: pg.Client,
    public readonly userId: string,
  ) {}

  static async open(userId: string): Promise<UserSession> {
    const client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    await client.query(`set role authenticated`)
    await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId])
    return new UserSession(client, userId)
  }

  query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.client.query<T>(sql, params)
  }

  close() {
    return this.client.end()
  }
}

export async function createAuthUser(id: string, email: string): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    await client.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
  } finally {
    await client.end()
  }
}
