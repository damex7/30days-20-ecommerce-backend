// Small helpers shared by the inventory Server Actions.
import { field, type FormState } from '@/lib/validation'

/** The `id` hidden field as a positive whole number, or null if it's missing or tampered with. */
export function readId(formData: FormData, name = 'id'): number | null {
  const value = field(formData, name)
  return /^\d{1,9}$/.test(value) ? Number(value) : null
}

/** The `archived` hidden field: "true" archives, anything else restores. */
export function readArchived(formData: FormData): boolean {
  return field(formData, 'archived') === 'true'
}

/** Every form value as text, to send back so the form keeps what was typed after an error. */
export function formValues<F extends string>(formData: FormData, names: readonly F[]): Record<F, string> {
  return Object.fromEntries(names.map((name) => [name, field(formData, name)])) as Record<F, string>
}

/** A success answer for useActionState. */
export function succeeded<F extends string = string>(message: string, values: Partial<Record<F, string>> = {}): FormState<F> {
  return { status: 'success', message, values, submissionId: Date.now() }
}

/** A field-level error (e.g. "that SKU is taken"), keeping what was typed. */
export function fieldError<F extends string>(name: F, message: string, values: Partial<Record<F, string>>): FormState<F> {
  return {
    status: 'error',
    message: 'Please fix the problem below.',
    fieldErrors: { [name]: [message] } as Partial<Record<F, string[]>>,
    values,
    submissionId: Date.now(),
  }
}

/** "1 product" / "6 products". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en-NG')} ${count === 1 ? one : many}`
}
