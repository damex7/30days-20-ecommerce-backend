// npm run check:contrast
//
// Reads the colour tokens from app/globals.css (both sides of every
// light-dark() pair) and checks the text/background pairs the UI actually
// uses against WCAG 2.2 contrast minimums, in light AND dark mode:
//   text  4.5:1  normal-size text
//   ui    3:1    non-text UI: focus rings, input borders, the key mark
// Exits with code 1 if any pair fails, so it can run in CI.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const tokens = {}
for (const m of css.matchAll(/--color-([a-z-]+):\s*(?:light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)|(#[0-9a-f]{6}))/gi)) {
  const [, name, light, dark, both] = m
  tokens[name] = { light: light ?? both, dark: dark ?? both }
}

// [foreground, background, kind, where it's used]
const PAIRS = [
  ['ink', 'paper', 'text', 'body text, headings'],
  ['ink', 'raised', 'text', 'text on cards and inputs'],
  ['ink', 'sunken', 'text', 'text in wells'],
  ['ink', 'tint', 'text', 'selected rows, chosen size/colour'],
  ['ink', 'tint-strong', 'text', 'hovered choice'],
  ['muted', 'paper', 'text', 'hints, dates, helper text'],
  ['muted', 'raised', 'text', 'hints on cards, struck-through old price'],
  ['muted', 'sunken', 'text', 'muted text in wells'],
  ['muted', 'tint', 'text', 'muted text in a selected row'],
  ['on-brand', 'brand', 'text', 'primary button, selected choice'],
  ['on-brand', 'brand-hover', 'text', 'primary button (hover)'],
  ['brand', 'paper', 'text', 'brand accent text, prices'],
  ['brand', 'raised', 'text', 'brand text on cards'],
  ['brand', 'tint', 'text', 'brand text on tint'],
  ['link', 'paper', 'text', 'links'],
  ['link', 'raised', 'text', 'links on cards'],
  ['link', 'link-soft', 'text', 'docs code blocks, info notices'],
  ['ink', 'link-soft', 'text', 'body text in docs panels'],
  ['danger', 'paper', 'text', 'error messages under fields'],
  ['danger', 'raised', 'text', 'errors on cards'],
  ['danger', 'danger-soft', 'text', 'CANCELLED badge, error summary heading'],
  ['ink', 'danger-soft', 'text', 'body text in the error summary'],
  ['on-danger', 'danger', 'text', 'DELETE badge, danger buttons'],
  ['on-danger', 'danger-hover', 'text', 'danger button (hover)'],
  ['success', 'raised', 'text', 'success text'],
  ['success', 'success-soft', 'text', 'DELIVERED badge, success notices'],
  ['ink', 'success-soft', 'text', 'body text in success notices'],
  ['on-success', 'success', 'text', 'GET badge'],
  ['cobalt', 'cobalt-soft', 'text', 'PAID badge'],
  ['on-cobalt', 'cobalt', 'text', 'POST badge'],
  ['khaki', 'khaki-soft', 'text', 'PROCESSING badge, notices'],
  ['ink', 'khaki-soft', 'text', 'body text in khaki notices'],
  ['on-khaki', 'khaki', 'text', 'PATCH badge'],
  ['on-charcoal', 'charcoal', 'text', 'SHIPPED badge, PUT badge'],
  ['ash', 'ash-soft', 'text', 'AWAITING PAYMENT badge'],
  ['ash', 'raised', 'text', 'ash text on cards'],
  ['danger', 'paper', 'text', 'REFUNDED badge (outline on the page)'],
  ['line-strong', 'paper', 'ui', 'input and button borders'],
  ['line-strong', 'raised', 'ui', 'input borders on cards'],
  ['focus', 'paper', 'ui', 'focus ring'],
  ['focus', 'raised', 'ui', 'focus ring on cards'],
  ['focus', 'tint', 'ui', 'focus ring on a chosen option'],
  ['focus', 'sunken', 'ui', 'focus ring in wells'],
  ['danger', 'raised', 'ui', 'invalid input border'],
  ['brand', 'paper', 'ui', 'primary button against the page'],
  ['brand', 'tint', 'ui', 'selected option border'],
  ['ash', 'ash-soft', 'ui', 'pending badge dashed outline'],
  ['charcoal', 'paper', 'ui', 'shipped chip against the page'],
]
const MIN = { text: 4.5, large: 3, ui: 3 }

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

let failures = 0
for (const mode of ['light', 'dark']) {
  console.log(`\n${mode.toUpperCase()} MODE`)
  for (const [fg, bg, kind, where] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      console.log(`  ✗ missing token: ${!tokens[fg] ? fg : bg}`)
      failures++
      continue
    }
    const r = ratio(tokens[fg][mode], tokens[bg][mode])
    const ok = r >= MIN[kind]
    if (!ok) failures++
    console.log(`  ${ok ? '✓' : '✗'} ${r.toFixed(2).padStart(5)}:1  ${`${fg} on ${bg}`.padEnd(30)} ${kind.padEnd(5)} ${where}`)
  }
}
console.log(failures ? `\n${failures} pair(s) below the WCAG AA minimum.` : '\nEvery pair meets WCAG AA.')
process.exit(failures ? 1 : 0)
