// GET /api/v1/openapi.json: the whole API as an OpenAPI 3.1 document,
// generated from the same Zod schemas the routes validate with.
import { endpoints } from '@/lib/api/endpoints'
import { handle, ok } from '@/lib/api/handler'
import { buildOpenApi } from '@/lib/api/openapi'

export const GET = handle(endpoints.openapi, async () => ok(buildOpenApi(), { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' }))
