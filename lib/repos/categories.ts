// CATEGORIES: SQL only. No rules about who may call these (that's the
// service layer); every value is a parameter; every row is checked by Zod.
import 'server-only'

import { z } from 'zod'
import { one, rows, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'

export const CategoryRow = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  position: z.number().int(),
  productCount: z.number().int(),
  version: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type CategoryRow = z.infer<typeof CategoryRow>

const columns = q`
  c.id, c.slug, c.name, c.description, c.position, c.version,
  c.created_at AS "createdAt", c.updated_at AS "updatedAt",
  (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS "productCount"`

export function listCategories(db: Db): Promise<CategoryRow[]> {
  return rows(db, CategoryRow, q`SELECT ${columns} FROM categories c ORDER BY c.position, c.name`, 'listCategories')
}

export function findCategory(db: Db, id: number): Promise<CategoryRow | null> {
  return one(db, CategoryRow, q`SELECT ${columns} FROM categories c WHERE c.id = ${id}`, 'findCategory')
}

export type CategoryInput = { slug: string; name: string; description: string; position: number }

export function insertCategory(db: Db, input: CategoryInput): Promise<CategoryRow | null> {
  return one(
    db,
    CategoryRow,
    q`WITH c AS (
        INSERT INTO categories (slug, name, description, position)
        VALUES (${input.slug}, ${input.name}, ${input.description}, ${input.position})
        RETURNING *
      )
      SELECT ${columns} FROM c`,
    'insertCategory',
  )
}

/** Optimistic concurrency: only matches if `version` is still current, and bumps it. null = stale or missing. */
export function updateCategory(db: Db, id: number, version: number, patch: Partial<CategoryInput>): Promise<CategoryRow | null> {
  return one(
    db,
    CategoryRow,
    q`WITH c AS (
        UPDATE categories SET
          slug = COALESCE(${patch.slug ?? null}, slug),
          name = COALESCE(${patch.name ?? null}, name),
          description = COALESCE(${patch.description ?? null}, description),
          position = COALESCE(${patch.position ?? null}::smallint, position),
          version = version + 1
        WHERE id = ${id} AND version = ${version}
        RETURNING *
      )
      SELECT ${columns} FROM c`,
    'updateCategory',
  )
}
