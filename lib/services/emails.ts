// ORDER EMAILS: the receipt to the customer and "new order" to staff.
//
// Sent with after(): once the response has gone, so a slow email provider
// never makes the webhook (or the payment page) slow, and a failed send
// never undoes a payment. Demo accounts' emails are printed to the log
// instead (lib/auth/email.ts).
import 'server-only'

import { after } from 'next/server'
import { appUrl, escapeHtml, layout, sendEmail, type Email } from '@/lib/auth/email'
import { http } from '@/lib/db/executor'
import { formatNaira } from '@/lib/money'
import { listOrderItems, type OrderItemRow, type OrderRow } from '@/lib/repos/orders'
import { listStaffEmails } from '@/lib/repos/users'

function itemsTable(items: OrderItemRow[]): string {
  const rows = items
    .map(
      (i) => `<tr><td style="padding:6px 0">${escapeHtml(i.productName)}<br><span style="color:#5d5246;font-size:13px">${escapeHtml(i.variantLabel)} · ${escapeHtml(i.sku)} × ${i.quantity}</span></td><td style="padding:6px 0;text-align:right;white-space:nowrap">${formatNaira(i.lineTotalKobo)}</td></tr>`,
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 16px">${rows}</table>`
}

function totalsText(order: OrderRow): string[] {
  return [
    `Subtotal: ${formatNaira(order.subtotalKobo)}`,
    ...(order.discountKobo > 0 ? [`Discount${order.couponCode ? ` (${order.couponCode})` : ''}: −${formatNaira(order.discountKobo)}`] : []),
    `Delivery to ${order.shipState}: ${formatNaira(order.deliveryFeeKobo)}`,
    `Total paid: ${formatNaira(order.totalKobo)}`,
  ]
}

function receipt(order: OrderRow, items: OrderItemRow[]): Email {
  const url = appUrl(`/account/orders/${order.id}`)
  const lines = items.map((i) => `- ${i.productName} (${i.variantLabel}) × ${i.quantity}: ${formatNaira(i.lineTotalKobo)}`)
  return {
    to: order.customerEmail,
    subject: `Receipt for order ${order.number}`,
    idempotencyKey: `receipt-${order.id}`,
    text: [`Hello ${order.customerName},`, '', `Thank you! We've received your payment for order ${order.number}.`, '', ...lines, '', ...totalsText(order), '', `It will arrive in ${order.deliveryMinDays}–${order.deliveryMaxDays} working days. Track it here: ${url}`].join('\n'),
    html: layout(
      `Thank you for order ${order.number}`,
      [
        `Hello ${escapeHtml(order.customerName)}, we’ve received your payment.`,
        itemsTable(items),
        totalsText(order).map(escapeHtml).join('<br>'),
        `Delivering to ${escapeHtml(order.shipRecipient)}, ${escapeHtml(order.shipCity)}, ${escapeHtml(order.shipState)} in ${order.deliveryMinDays}–${order.deliveryMaxDays} working days.`,
      ],
      { label: 'Track your order', url },
    ),
  }
}

function staffNotice(to: string, order: OrderRow, items: OrderItemRow[]): Email {
  const url = appUrl(`/admin/orders/${order.id}`)
  return {
    to,
    subject: `New paid order ${order.number}: ${formatNaira(order.totalKobo)}${order.isDemo ? ' (demo)' : ''}`,
    idempotencyKey: `staff-${order.id}-${to}`,
    text: [`Order ${order.number} was paid.`, '', ...items.map((i) => `- ${i.sku} × ${i.quantity}`), '', `Ship to ${order.shipCity}, ${order.shipState}.`, `Open it: ${url}`].join('\n'),
    html: layout(`New paid order ${order.number}`, [itemsTable(items), `Ship to ${escapeHtml(order.shipCity)}, ${escapeHtml(order.shipState)}.`], { label: 'Open the order', url }),
  }
}

/** Queues both emails for after the response. */
export function sendPaidOrderEmails(order: OrderRow): void {
  after(async () => {
    const items = await listOrderItems(http, [order.id])
    await sendEmail(receipt(order, items))
    // Staff who can act on it: active staff and admins (demo accounts are excluded).
    for (const email of await listStaffEmails(http)) await sendEmail(staffNotice(email, order, items))
  })
}
