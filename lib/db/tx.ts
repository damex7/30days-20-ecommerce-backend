// INTERACTIVE TRANSACTIONS: BEGIN, several statements whose results the
// code READS between steps, then COMMIT (or ROLLBACK on any error).
//
// Checkout needs this. It must look at the answer to "did the guarded stock
// UPDATE match a row?" for every cart line, decide whether the coupon still
// applies, and only then insert the order. Day 18/19's one-shot
// sqlTransaction (a whole transaction in one HTTPS request) can't do that:
// all of its statements are sent before any result comes back.
//
// THE COST: each statement is a network round trip while the transaction
// holds its locks. From a laptop in Nigeria to Neon in Europe that's about
// 250 ms each; on Vercel, deployed in the same region as the database, it's
// a couple of milliseconds. Transactions here are short and touch few rows.
//
// The Pool lives for the life of the server process, so connections are
// reused between requests instead of paying for a new WebSocket + TLS +
// login every time. The pooled Neon URL (PgBouncer, transaction mode) is
// fine here: everything a transaction needs happens between its BEGIN and
// COMMIT.
import 'server-only'

import { neonConfig, Pool, type PoolClient } from '@neondatabase/serverless'
import { type Db, type Row } from './executor'
import { compile } from './sql'

// Node 22+ has WebSocket built in; the driver needs to be told to use it.
neonConfig.webSocketConstructor = WebSocket

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local (or add it in Vercel).')
    // A small pool: each serverless instance handles few requests at once,
    // and PgBouncer multiplexes them onto real connections anyway.
    pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 })
    // An idle connection dropped by the server must not crash the process.
    pool.on('error', (error: Error) => console.error('[db] idle pool connection error:', error.message))
  }
  return pool
}

function txExecutor(client: PoolClient): Db {
  return {
    kind: 'tx',
    async query(fragment) {
      const { text, values } = compile(fragment)
      const result = await client.query(text, values)
      return result.rows as Row[]
    },
  }
}

/**
 * Runs `work` inside one transaction and returns its result.
 *
 * If `work` throws (a ServiceError like "out of stock", or a database
 * error), everything it did is ROLLED BACK and the error is re-thrown:
 * the stock it took, the coupon use, the half-made order, all undone.
 *
 * READ COMMITTED (PostgreSQL's default) is enough, because every decision
 * that could race is made by a GUARDED UPDATE (`... WHERE stock >= $1`),
 * which locks the row and re-checks the condition against the latest
 * committed value. Two checkouts for the last pair of sandals: the first
 * UPDATE takes the lock, the second waits, then re-checks `stock >= 1`,
 * finds 0 and matches nothing.
 */
export async function withTransaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  let broken: Error | undefined
  try {
    await client.query('BEGIN')
    const result = await work(txExecutor(client))
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      // The connection itself failed. Passing the error to release()
      // makes the Pool throw this connection away instead of reusing it.
      broken = rollbackError instanceof Error ? rollbackError : new Error('rollback failed')
    }
    throw error
  } finally {
    client.release(broken)
  }
}
