// THE API, ENDPOINT BY ENDPOINT. Route handlers in app/api/v1/** import
// their definition from here; lib/api/openapi.ts turns this list into the
// OpenAPI 3.1 document; /docs renders that document.
import 'server-only'

import { z } from 'zod'
import { endpoint, type ResponseSpec } from './endpoint'
import * as req from './requests'
import * as res from './responses'

const problem = (description: string): ResponseSpec => ({ description, schema: res.ProblemSchema })
const P = {
  400: problem('Malformed request (bad JSON, missing header, bad cursor)'),
  401: problem('No valid credentials'),
  403: problem('Not allowed: wrong role, missing scope, or a read-only demo account'),
  404: problem('Not found, or not yours'),
  409: problem('Conflicts with the current state (stale version, invalid status move, out of stock)'),
  422: problem('Invalid fields (see errors)'),
  429: problem('Rate limited; see Retry-After'),
  503: problem('Database or payment provider unavailable'),
}
const pick = (...codes: (keyof typeof P)[]) => Object.fromEntries(codes.map((c) => [c, P[c]]))

// Products live under ONE dynamic folder, app/api/v1/products/[ref]: GET
// takes the slug (/products/ona-loafer), PATCH and DELETE the id
// (/products/7). Next.js can't have [slug] and [id] side by side.
const slugParams = z.object({ ref: z.string().min(1).max(80) })
const productIdParams = z.object({ ref: req.idParam })
const idParams = z.object({ id: req.idParam })
const uuidParams = z.object({ id: req.uuidParam })
const stateParams = z.object({ state: z.enum(req.NIGERIAN_STATES) })

export const endpoints = {
  // ---------------------------------------------------------------- Auth
  signup: endpoint({
    method: 'POST', path: '/api/v1/auth/signup', tag: 'Auth', auth: 'public', who: 'Public (rate-limited)',
    summary: 'Create a customer account',
    description: 'Always creates a CUSTOMER. Always answers 202 with the same message, whether or not the email already had an account (no account enumeration); the verification link is emailed.',
    body: req.signupBody,
    responses: { 202: { description: 'Accepted: check your inbox', schema: z.object({ message: z.string() }) }, ...pick(422, 429) },
    exampleBody: { name: 'Adaeze Okafor', email: 'adaeze@example.com', phone: '0803 123 4567', password: 'a long passphrase' },
  }),
  login: endpoint({
    method: 'POST', path: '/api/v1/auth/login', tag: 'Auth', auth: 'public', who: 'Public (rate-limited)',
    summary: 'Sign in and receive the session cookie',
    description: 'Sets the HttpOnly session cookie (send it back on later requests, e.g. with curl -b). Demo accounts can’t sign in with a password.',
    body: req.loginBody,
    responses: { 200: { description: 'Signed in', schema: res.MeSchema }, ...pick(401, 422, 429) },
    exampleBody: { email: 'customer@example.com', password: '…' },
  }),
  logout: endpoint({
    method: 'POST', path: '/api/v1/auth/logout', tag: 'Auth', auth: 'required', who: 'Session',
    summary: 'End this session',
    responses: { 204: { description: 'Signed out' }, ...pick(401) },
  }),
  getMe: endpoint({
    method: 'GET', path: '/api/v1/me', tag: 'Me', auth: 'required', who: 'Session · any API key',
    summary: 'Who am I?', description: 'The signed-in user, or the API key with its scopes.',
    responses: { 200: { description: 'You', schema: res.MeSchema }, ...pick(401) },
  }),
  updateMe: endpoint({
    method: 'PATCH', path: '/api/v1/me', tag: 'Me', auth: 'required', who: 'Session (not demo staff/admin)',
    summary: 'Update your name and phone', body: req.updateMeBody,
    responses: { 200: { description: 'Updated', schema: res.MeSchema }, ...pick(401, 403, 422) },
    exampleBody: { name: 'Adaeze Okafor', phone: '0803 123 4567' },
  }),

  // ---------------------------------------------------------------- Catalogue
  listCategories: endpoint({
    method: 'GET', path: '/api/v1/categories', tag: 'Catalogue', auth: 'public', who: 'Public · key catalog:read', scope: 'catalog:read',
    summary: 'List categories', cacheable: true,
    responses: { 200: { description: 'Categories', schema: z.object({ data: z.array(res.CategorySchema) }) } },
  }),
  createCategory: endpoint({
    method: 'POST', path: '/api/v1/categories', tag: 'Catalogue', auth: 'required', who: 'Staff · admin · key catalog:write', scope: 'catalog:write',
    summary: 'Create a category', body: req.createCategoryBody,
    responses: { 201: { description: 'Created', schema: res.CategorySchema }, ...pick(401, 403, 409, 422) },
    exampleBody: { slug: 'wallets', name: 'Wallets', description: 'Card holders and bifolds', position: 4 },
  }),
  updateCategory: endpoint({
    method: 'PATCH', path: '/api/v1/categories/{id}', tag: 'Catalogue', auth: 'required', who: 'Staff · admin · key catalog:write', scope: 'catalog:write',
    summary: 'Update a category', params: idParams, body: req.updateCategoryBody,
    responses: { 200: { description: 'Updated', schema: res.CategorySchema }, ...pick(401, 403, 404, 409, 422) },
    exampleBody: { name: 'Wallets & card holders', version: 1 }, examplePath: '/api/v1/categories/1',
  }),
  listProducts: endpoint({
    method: 'GET', path: '/api/v1/products', tag: 'Catalogue', auth: 'public', who: 'Public · key catalog:read', scope: 'catalog:read',
    summary: 'List, filter, search and sort products',
    description: 'Cursor-paginated. Filters combine: ?category=shoes&size=42&colour=tan&in_stock=true&max_price=5000000&sort=price_asc. Sends ETag and Cache-Control; answers 304 to a matching If-None-Match.',
    query: req.productListQuery, cacheable: true,
    responses: { 200: { description: 'One page of products', schema: res.listOf(res.ProductSummarySchema) }, 304: { description: 'Not modified' }, ...pick(400, 403, 422, 429) },
    examplePath: '/api/v1/products?category=shoes&sort=price_asc&limit=4',
  }),
  getProduct: endpoint({
    method: 'GET', path: '/api/v1/products/{slug}', tag: 'Catalogue', auth: 'public', who: 'Public · key catalog:read', scope: 'catalog:read',
    summary: 'One product with variants and images', params: slugParams, cacheable: true,
    responses: { 200: { description: 'The product', schema: res.ProductDetailSchema }, 304: { description: 'Not modified' }, ...pick(404, 429) },
    examplePath: '/api/v1/products/ona-loafer',
  }),
  createProduct: endpoint({
    method: 'POST', path: '/api/v1/products', tag: 'Catalogue', auth: 'required', who: 'Staff · admin · key catalog:write', scope: 'catalog:write',
    summary: 'Create a product (then add variants)', body: req.createProductBody,
    responses: { 201: { description: 'Created', schema: res.ProductDetailSchema }, ...pick(401, 403, 409, 422) },
    exampleBody: { slug: 'ikoyi-card-holder', name: 'Ikoyi card holder', description: 'Six slots, full-grain leather.', category_id: 2, status: 'draft' },
  }),
  updateProduct: endpoint({
    method: 'PATCH', path: '/api/v1/products/{id}', tag: 'Catalogue', auth: 'required', who: 'Staff · admin · key catalog:write', scope: 'catalog:write',
    summary: 'Update a product (status=archived to archive)', params: productIdParams, body: req.updateProductBody,
    responses: { 200: { description: 'Updated', schema: res.ProductDetailSchema }, ...pick(401, 403, 404, 409, 422) },
    exampleBody: { status: 'active', version: 3 }, examplePath: '/api/v1/products/1',
  }),
  deleteProduct: endpoint({
    method: 'DELETE', path: '/api/v1/products/{id}', tag: 'Catalogue', auth: 'required', who: 'Staff · admin · key catalog:write', scope: 'catalog:write',
    summary: 'Delete a never-ordered product', description: 'A product that appears in any order can’t be deleted (409 has_orders): archive it instead.', params: productIdParams,
    responses: { 204: { description: 'Deleted' }, ...pick(401, 403, 404, 409) }, examplePath: '/api/v1/products/1',
  }),
  createVariant: endpoint({
    method: 'POST', path: '/api/v1/products/{id}/variants', tag: 'Catalogue', auth: 'required', who: 'Staff · admin · key catalog:write', scope: 'catalog:write',
    summary: 'Add a size/colour variant', params: productIdParams, body: req.createVariantBody,
    responses: { 201: { description: 'Created', schema: res.VariantSchema }, ...pick(401, 403, 404, 409, 422) },
    exampleBody: { sku: 'ONA-LOAF-44-TAN', size: '44', colour: 'Tan', price_kobo: 4500000, compare_at_price_kobo: null, stock: 6 }, examplePath: '/api/v1/products/1/variants',
  }),
  updateVariant: endpoint({
    method: 'PATCH', path: '/api/v1/variants/{id}', tag: 'Catalogue', auth: 'required', who: 'Staff · admin · key catalog:write', scope: 'catalog:write',
    summary: 'Change a variant’s price, stock or status', params: idParams, body: req.updateVariantBody,
    responses: { 200: { description: 'Updated', schema: res.VariantSchema }, ...pick(401, 403, 404, 409, 422) },
    exampleBody: { stock: 12, version: 2 }, examplePath: '/api/v1/variants/1',
  }),
  deleteVariant: endpoint({
    method: 'DELETE', path: '/api/v1/variants/{id}', tag: 'Catalogue', auth: 'required', who: 'Staff · admin · key catalog:write', scope: 'catalog:write',
    summary: 'Delete a never-ordered variant', params: idParams,
    responses: { 204: { description: 'Deleted' }, ...pick(401, 403, 404, 409) }, examplePath: '/api/v1/variants/1',
  }),
  createImage: endpoint({
    method: 'POST', path: '/api/v1/products/{id}/images', tag: 'Catalogue', auth: 'required', who: 'Staff · admin · key catalog:write', scope: 'catalog:write',
    summary: 'Add an image (a path in /public)', params: productIdParams, body: req.createImageBody,
    responses: { 201: { description: 'Created', schema: res.ImageSchema }, ...pick(401, 403, 404, 422) },
    exampleBody: { url: '/products/ona-loafer-2.svg', alt: 'Tan loafer from above, showing the hand stitching' }, examplePath: '/api/v1/products/1/images',
  }),
  deleteImage: endpoint({
    method: 'DELETE', path: '/api/v1/images/{id}', tag: 'Catalogue', auth: 'required', who: 'Staff · admin · key catalog:write', scope: 'catalog:write',
    summary: 'Remove an image', params: idParams,
    responses: { 204: { description: 'Deleted' }, ...pick(401, 403, 404) }, examplePath: '/api/v1/images/1',
  }),

  // ---------------------------------------------------------------- Cart
  getCart: endpoint({
    method: 'GET', path: '/api/v1/cart', tag: 'Cart', auth: 'required', who: 'Customer',
    summary: 'Your cart with live prices', description: 'Add ?address_id= to include the delivery fee for that address.', query: req.cartQuery,
    responses: { 200: { description: 'The cart', schema: res.CartSchema }, ...pick(401, 403, 404) },
  }),
  addCartItem: endpoint({
    method: 'POST', path: '/api/v1/cart/items', tag: 'Cart', auth: 'required', who: 'Customer',
    summary: 'Add a variant (or more of it)', body: req.addCartItemBody,
    responses: { 201: { description: 'The cart after adding', schema: res.CartSchema }, ...pick(401, 403, 409, 422) },
    exampleBody: { variant_id: 12, quantity: 1 },
  }),
  updateCartItem: endpoint({
    method: 'PATCH', path: '/api/v1/cart/items/{id}', tag: 'Cart', auth: 'required', who: 'Customer',
    summary: 'Change a quantity', params: idParams, body: req.updateCartItemBody,
    responses: { 200: { description: 'The cart', schema: res.CartSchema }, ...pick(401, 403, 404, 409, 422) },
    exampleBody: { quantity: 2 }, examplePath: '/api/v1/cart/items/1',
  }),
  deleteCartItem: endpoint({
    method: 'DELETE', path: '/api/v1/cart/items/{id}', tag: 'Cart', auth: 'required', who: 'Customer',
    summary: 'Remove an item', params: idParams,
    responses: { 204: { description: 'Removed' }, ...pick(401, 403, 404) }, examplePath: '/api/v1/cart/items/1',
  }),
  applyCoupon: endpoint({
    method: 'PUT', path: '/api/v1/cart/coupon', tag: 'Cart', auth: 'required', who: 'Customer',
    summary: 'Apply a coupon code', description: '422 with the reason when it can’t be used: coupon_expired, coupon_used_up, coupon_minimum_not_met, coupon_customer_limit, coupon_unknown.', body: req.applyCouponBody,
    responses: { 200: { description: 'The cart with the discount', schema: res.CartSchema }, ...pick(401, 403, 409, 422) },
    exampleBody: { code: 'ABA10' },
  }),
  removeCoupon: endpoint({
    method: 'DELETE', path: '/api/v1/cart/coupon', tag: 'Cart', auth: 'required', who: 'Customer',
    summary: 'Remove the coupon',
    responses: { 204: { description: 'Removed' }, ...pick(401, 403) },
  }),

  // ---------------------------------------------------------------- Addresses & delivery
  listAddresses: endpoint({
    method: 'GET', path: '/api/v1/addresses', tag: 'Addresses', auth: 'required', who: 'Customer (own)',
    summary: 'Your saved addresses',
    responses: { 200: { description: 'Addresses', schema: z.object({ data: z.array(res.AddressSchema) }) }, ...pick(401, 403) },
  }),
  createAddress: endpoint({
    method: 'POST', path: '/api/v1/addresses', tag: 'Addresses', auth: 'required', who: 'Customer',
    summary: 'Save an address', body: req.createAddressBody,
    responses: { 201: { description: 'Created', schema: res.AddressSchema }, ...pick(401, 403, 409, 422) },
    exampleBody: { recipient_name: 'Adaeze Okafor', phone: '0803 123 4567', street: '14 Faulks Road', city: 'Aba', state: 'Abia', landmark: 'Opposite Ariaria market gate', is_default: true },
  }),
  getAddress: endpoint({
    method: 'GET', path: '/api/v1/addresses/{id}', tag: 'Addresses', auth: 'required', who: 'Customer (own; else 404)',
    summary: 'One address', params: idParams,
    responses: { 200: { description: 'The address', schema: res.AddressSchema }, ...pick(401, 403, 404) }, examplePath: '/api/v1/addresses/1',
  }),
  updateAddress: endpoint({
    method: 'PATCH', path: '/api/v1/addresses/{id}', tag: 'Addresses', auth: 'required', who: 'Customer (own; else 404)',
    summary: 'Update an address', params: idParams, body: req.updateAddressBody,
    responses: { 200: { description: 'Updated', schema: res.AddressSchema }, ...pick(401, 403, 404, 409, 422) },
    exampleBody: { landmark: 'Beside the blue gate', version: 1 }, examplePath: '/api/v1/addresses/1',
  }),
  deleteAddress: endpoint({
    method: 'DELETE', path: '/api/v1/addresses/{id}', tag: 'Addresses', auth: 'required', who: 'Customer (own; else 404)',
    summary: 'Delete an address', params: idParams,
    responses: { 204: { description: 'Deleted' }, ...pick(401, 403, 404) }, examplePath: '/api/v1/addresses/1',
  }),
  listDeliveryFees: endpoint({
    method: 'GET', path: '/api/v1/delivery-fees', tag: 'Delivery fees', auth: 'public', who: 'Public',
    summary: 'Delivery fee and time for every state', cacheable: true,
    responses: { 200: { description: 'All 37', schema: z.object({ data: z.array(res.DeliveryFeeSchema) }) } },
  }),
  updateDeliveryFee: endpoint({
    method: 'PATCH', path: '/api/v1/delivery-fees/{state}', tag: 'Delivery fees', auth: 'required', who: 'Admin',
    summary: 'Change a state’s fee or delivery days', params: stateParams, body: req.updateDeliveryFeeBody,
    responses: { 200: { description: 'Updated', schema: res.DeliveryFeeSchema }, ...pick(401, 403, 404, 409, 422) },
    exampleBody: { fee_kobo: 350000, version: 1 }, examplePath: '/api/v1/delivery-fees/Lagos',
  }),

  // ---------------------------------------------------------------- Orders
  listOrders: endpoint({
    method: 'GET', path: '/api/v1/orders', tag: 'Orders', auth: 'required', who: 'Customer (own) · staff · admin · key orders:read', scope: 'orders:read',
    summary: 'List orders, newest first', description: 'Customers see only their own. Staff and keys can filter by status, date range and search.', query: req.orderListQuery,
    responses: { 200: { description: 'One page of orders', schema: res.listOf(res.OrderSchema) }, ...pick(400, 401, 403, 422) },
    examplePath: '/api/v1/orders?status=paid&limit=10',
  }),
  createOrder: endpoint({
    method: 'POST', path: '/api/v1/orders', tag: 'Orders', auth: 'required', who: 'Customer · Idempotency-Key required',
    summary: 'Place an order from the cart',
    description:
      'One transaction: live prices, guarded stock updates, the coupon claimed, the delivery fee added, the cart emptied. Requires an Idempotency-Key header: repeating the same key and body returns the SAME order (header Idempotent-Replayed: true); the same key with a different body is 422. Out of stock → 409 with short_items. Then POST /orders/{id}/payment.',
    body: req.createOrderBody, idempotencyKey: true,
    responses: { 201: { description: 'Created (stock reserved for 30 minutes)', schema: res.OrderDetailSchema }, ...pick(400, 401, 403, 409, 422, 429) },
    exampleBody: { address_id: 1 },
  }),
  getOrder: endpoint({
    method: 'GET', path: '/api/v1/orders/{id}', tag: 'Orders', auth: 'required', who: 'Owner · staff · admin · key orders:read', scope: 'orders:read',
    summary: 'One order with its items', description: 'Someone else’s order is 404, exactly like a missing one.', params: idParams,
    responses: { 200: { description: 'The order', schema: res.OrderDetailSchema }, ...pick(401, 403, 404) }, examplePath: '/api/v1/orders/1',
  }),
  listOrderEvents: endpoint({
    method: 'GET', path: '/api/v1/orders/{id}/events', tag: 'Orders', auth: 'required', who: 'Owner · staff · admin · key orders:read', scope: 'orders:read',
    summary: 'The order’s history', params: idParams,
    responses: { 200: { description: 'Events, oldest first', schema: z.object({ data: z.array(res.OrderEventSchema) }) }, ...pick(401, 403, 404) }, examplePath: '/api/v1/orders/1/events',
  }),
  transitionOrder: endpoint({
    method: 'POST', path: '/api/v1/orders/{id}/transitions', tag: 'Orders', auth: 'required', who: 'See the state machine (owner may cancel unpaid; staff; key orders:write)', scope: 'orders:write',
    summary: 'Move an order to its next status',
    description: 'Only moves in the state machine are accepted (409 invalid_transition otherwise, with allowed_next). A stale version is 409 stale_version. Cancelling a paid order (→ refunded) is staff/admin only and restores stock.',
    params: idParams, body: req.transitionBody,
    responses: { 200: { description: 'The order after the move', schema: res.OrderDetailSchema }, ...pick(401, 403, 404, 409, 422) },
    exampleBody: { to: 'processing', note: 'Packed and labelled', version: 2 }, examplePath: '/api/v1/orders/1/transitions',
  }),
  addOrderNote: endpoint({
    method: 'POST', path: '/api/v1/orders/{id}/notes', tag: 'Orders', auth: 'required', who: 'Staff · admin · key orders:write', scope: 'orders:write',
    summary: 'Add a note to the history', params: idParams, body: req.noteBody,
    responses: { 201: { description: 'The history with the note', schema: z.object({ data: z.array(res.OrderEventSchema) }) }, ...pick(401, 403, 404, 422) },
    exampleBody: { note: 'Customer asked for delivery after 4pm' }, examplePath: '/api/v1/orders/1/notes',
  }),
  startPayment: endpoint({
    method: 'POST', path: '/api/v1/orders/{id}/payment', tag: 'Orders', auth: 'required', who: 'Owner',
    summary: 'Get the Paystack checkout link', description: 'Calls Paystack’s initialize endpoint with the order total in kobo. Calling it again returns the same link.', params: idParams,
    responses: { 200: { description: 'Send the customer to authorization_url', schema: res.PaymentStartSchema }, ...pick(401, 403, 404, 409, 503) }, examplePath: '/api/v1/orders/1/payment',
  }),

  // ---------------------------------------------------------------- Admin
  listCoupons: endpoint({
    method: 'GET', path: '/api/v1/coupons', tag: 'Admin', auth: 'required', who: 'Admin', query: req.listQuery,
    summary: 'List coupons',
    responses: { 200: { description: 'Coupons', schema: res.listOf(res.CouponSchema) }, ...pick(401, 403) },
  }),
  createCoupon: endpoint({
    method: 'POST', path: '/api/v1/coupons', tag: 'Admin', auth: 'required', who: 'Admin', body: req.createCouponBody,
    summary: 'Create a coupon',
    responses: { 201: { description: 'Created', schema: res.CouponSchema }, ...pick(401, 403, 409, 422) },
    exampleBody: { code: 'DETTY10', kind: 'percent', value: 10, min_order_kobo: 3000000, max_uses: 200, per_customer_limit: 1, ends_at: '2026-12-31T23:59:59+01:00' },
  }),
  updateCoupon: endpoint({
    method: 'PATCH', path: '/api/v1/coupons/{id}', tag: 'Admin', auth: 'required', who: 'Admin', params: idParams, body: req.updateCouponBody,
    summary: 'Update or pause a coupon',
    responses: { 200: { description: 'Updated', schema: res.CouponSchema }, ...pick(401, 403, 404, 409, 422) },
    exampleBody: { active: false, version: 1 }, examplePath: '/api/v1/coupons/1',
  }),
  listUsers: endpoint({
    method: 'GET', path: '/api/v1/users', tag: 'Admin', auth: 'required', who: 'Admin', query: req.userListQuery,
    summary: 'List accounts',
    responses: { 200: { description: 'Users', schema: res.listOf(res.AdminUserSchema) }, ...pick(401, 403) },
  }),
  updateUser: endpoint({
    method: 'PATCH', path: '/api/v1/users/{id}', tag: 'Admin', auth: 'required', who: 'Admin', params: uuidParams, body: req.updateUserBody,
    summary: 'Change a role, or (de)activate',
    responses: { 200: { description: 'Updated', schema: res.AdminUserSchema }, ...pick(401, 403, 404, 409, 422) },
    exampleBody: { role: 'staff' }, examplePath: '/api/v1/users/00000000-0000-0000-0000-000000000000',
  }),
  listApiKeys: endpoint({
    method: 'GET', path: '/api/v1/api-keys', tag: 'Admin', auth: 'required', who: 'Admin',
    summary: 'List API keys (prefixes only)',
    responses: { 200: { description: 'Keys', schema: z.object({ data: z.array(res.ApiKeySchema) }) }, ...pick(401, 403) },
  }),
  createApiKey: endpoint({
    method: 'POST', path: '/api/v1/api-keys', tag: 'Admin', auth: 'required', who: 'Admin (not demo)', body: req.createApiKeyBody,
    summary: 'Create an API key (the secret is shown once)',
    responses: { 201: { description: 'Created; store `secret` now', schema: res.ApiKeyCreatedSchema }, ...pick(401, 403, 422) },
    exampleBody: { name: 'GIG courier', scopes: ['orders:read', 'orders:write'] },
  }),
  revokeApiKey: endpoint({
    method: 'DELETE', path: '/api/v1/api-keys/{id}', tag: 'Admin', auth: 'required', who: 'Admin', params: uuidParams,
    summary: 'Revoke an API key',
    responses: { 204: { description: 'Revoked' }, ...pick(401, 403, 404) }, examplePath: '/api/v1/api-keys/00000000-0000-0000-0000-000000000000',
  }),
  listPaymentEvents: endpoint({
    method: 'GET', path: '/api/v1/payment-events', tag: 'Admin', auth: 'required', who: 'Admin', query: req.listQuery,
    summary: 'The Paystack webhook log',
    responses: { 200: { description: 'Events, newest first', schema: res.listOf(res.PaymentEventSchema) }, ...pick(401, 403) },
  }),

  // ---------------------------------------------------------------- Meta & machine-to-machine
  openapi: endpoint({
    method: 'GET', path: '/api/v1/openapi.json', tag: 'Meta', auth: 'public', who: 'Public',
    summary: 'This API, as an OpenAPI 3.1 document',
    responses: { 200: { description: 'The OpenAPI document' } },
  }),
  paystackWebhook: endpoint({
    method: 'POST', path: '/api/webhooks/paystack', tag: 'Meta', auth: 'paystack', who: 'Paystack (x-paystack-signature)',
    summary: 'Paystack events (charge.success)',
    description: 'The signature (HMAC-SHA512 of the raw body with the secret key) is checked before anything is read; a bad one is 401. Each event is applied once; repeats answer 200 and change nothing.',
    responses: { 200: { description: 'Received' }, 401: problem('Bad signature') },
  }),
  cronExpire: endpoint({
    method: 'GET', path: '/api/cron/expire-orders', tag: 'Meta', auth: 'cron', who: 'Vercel cron (Bearer CRON_SECRET)',
    summary: 'Daily: expire unpaid orders, purge old idempotency keys, clean up demo customers',
    responses: { 200: { description: 'What was done', schema: z.object({ expired_orders: z.int(), purged_idempotency_keys: z.int(), removed_demo_customers: z.int() }) }, 401: problem('Missing or wrong CRON_SECRET') },
  }),
} as const

export type EndpointName = keyof typeof endpoints
