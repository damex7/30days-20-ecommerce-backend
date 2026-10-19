// THE WORKSHOP (admin area) shell: the tabs. Each PAGE still checks the
// role itself (requireShopActor) and every SERVICE checks again: a layout
// isn't re-run on client navigation, so it must never be the only gate.
import { Suspense } from 'react'
import { AdminNav, type AdminNavItem } from '@/components/admin/admin-nav'
import { getCurrentSession } from '@/lib/auth/dal'

const STAFF_TABS: AdminNavItem[] = [
  { href: '/admin', label: 'Overview', icon: 'dashboard' },
  { href: '/admin/orders', label: 'Orders', icon: 'receipt' },
  { href: '/admin/products', label: 'Products', icon: 'package' },
]
const ADMIN_TABS: AdminNavItem[] = [
  { href: '/admin/coupons', label: 'Coupons', icon: 'tag' },
  { href: '/admin/delivery-fees', label: 'Delivery fees', icon: 'truck' },
  { href: '/admin/users', label: 'Users', icon: 'users' },
  { href: '/admin/api-keys', label: 'API keys', icon: 'key' },
  { href: '/admin/webhooks', label: 'Webhook log', icon: 'webhook' },
]

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <>
      <Suspense fallback={<div className="skeleton mb-6 h-11 w-full" />}>
        <Tabs />
      </Suspense>
      {children}
    </>
  )
}

async function Tabs() {
  const current = await getCurrentSession().catch(() => null)
  const items = current?.user.role === 'admin' ? [...STAFF_TABS, ...ADMIN_TABS] : STAFF_TABS
  return <AdminNav items={items} />
}
