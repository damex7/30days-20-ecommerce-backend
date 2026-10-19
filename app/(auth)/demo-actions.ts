// THE "EXPLORE THE DEMO" BUTTONS. Server Actions, so each is a POST with
// Next.js's Origin check, never a GET link (a link could be prefetched or
// embedded on another site and sign people in by accident). Rate-limited
// per IP in lib/services/demo.ts. With DEMO_MODE off they answer "not found".
'use server'

import { redirect } from 'next/navigation'
import { fromServiceError } from '@/lib/action-helpers'
import { getRequestInfo } from '@/lib/auth/request'
import { startDemoCustomer, startDemoShopAccount } from '@/lib/services/demo'
import { field, type FormState } from '@/lib/validation'

export async function startDemo(_previous: FormState, formData: FormData): Promise<FormState> {
  const role = field(formData, 'role')
  const request = await getRequestInfo()
  try {
    if (role === 'customer') await startDemoCustomer(request)
    else if (role === 'staff' || role === 'admin') await startDemoShopAccount(role, request)
    else return { status: 'error', message: 'Choose one of the three demo accounts.', submissionId: Date.now() }
  } catch (error) {
    return fromServiceError(error)
  }
  redirect(role === 'customer' ? '/products?notice=demo' : '/admin')
}
