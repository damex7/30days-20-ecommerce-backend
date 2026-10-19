// node scripts/make-product-art.mjs
//
// Draws the product pictures in public/products/: one simple, hand-drawn
// style SVG per category and leather colour (no photos and no uploads
// today). Each has a stitched border, like the edge of a hide. Run it again
// after changing a colour; the files are committed, so the app doesn't
// need this script to run.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = join(import.meta.dirname, '..', 'public', 'products')

const LEATHER = {
  tan: { body: '#b07a4a', shade: '#8a5a32', light: '#d3a273' },
  espresso: { body: '#4a2c1d', shade: '#2f1b11', light: '#6e4630' },
  black: { body: '#24201d', shade: '#121010', light: '#4a433d' },
  oxblood: { body: '#6b2a26', shade: '#4a1a17', light: '#8d3f39' },
  natural: { body: '#cfb08a', shade: '#a8875f', light: '#e6cfae' },
  brown: { body: '#7a4e2d', shade: '#5a361d', light: '#9c6b43' },
}

const thread = '#efe6d6'
const stitch = (d) => `<path d="${d}" fill="none" stroke="${thread}" stroke-width="2.2" stroke-dasharray="5 5" stroke-linecap="round"/>`

const SHAPES = {
  shoe: (c) => `
    <path d="M70 250 C70 205 105 190 150 182 L230 168 C262 160 290 140 318 142 C350 144 372 168 392 196 C420 236 432 258 430 278 L430 292 L74 292 C66 292 66 270 70 250 Z" fill="${c.body}"/>
    <path d="M74 292 L430 292 L430 306 C430 312 424 316 416 316 L86 316 C78 316 72 312 72 306 Z" fill="${c.shade}"/>
    <path d="M232 170 C246 200 286 214 330 206" fill="none" stroke="${c.shade}" stroke-width="4"/>
    ${stitch('M92 262 C150 248 250 246 418 270')}
    ${stitch('M238 178 C254 202 290 210 326 202')}
    <ellipse cx="320" cy="168" rx="26" ry="9" fill="${c.light}" opacity=".55"/>`,
  bag: (c) => `
    <path d="M170 150 C170 96 330 96 330 150" fill="none" stroke="${c.shade}" stroke-width="16" stroke-linecap="round"/>
    <rect x="110" y="150" width="280" height="190" rx="22" fill="${c.body}"/>
    <path d="M110 205 L390 205" stroke="${c.shade}" stroke-width="4"/>
    <rect x="232" y="196" width="36" height="30" rx="5" fill="#c9a24d" stroke="#8a6d2a" stroke-width="3"/>
    ${stitch('M126 166 L374 166 L374 324 L126 324 Z')}
    <rect x="140" y="250" width="70" height="8" rx="4" fill="${c.light}" opacity=".5"/>`,
  belt: (c) => `
    <path d="M60 210 L370 210 C392 210 400 222 400 240 C400 258 392 270 370 270 L60 270 Z" fill="${c.body}"/>
    ${stitch('M70 220 L368 220')}
    ${stitch('M70 260 L368 260')}
    <rect x="392" y="196" width="64" height="88" rx="12" fill="none" stroke="#c9a24d" stroke-width="12"/>
    <path d="M424 200 L424 280" stroke="#8a6d2a" stroke-width="6" stroke-linecap="round"/>
    <circle cx="300" cy="240" r="6" fill="${c.shade}"/><circle cx="260" cy="240" r="6" fill="${c.shade}"/><circle cx="220" cy="240" r="6" fill="${c.shade}"/>`,
  sandal: (c) => `
    <path d="M110 300 C96 250 120 190 190 180 L330 180 C392 182 418 230 410 270 C404 300 380 312 350 312 L140 312 C122 312 114 308 110 300 Z" fill="${c.shade}"/>
    <path d="M130 292 C122 252 142 204 196 198 L326 198 C376 200 396 236 390 266 C386 288 368 296 346 296 L150 296 C140 296 134 296 130 292 Z" fill="${c.light}"/>
    <path d="M170 200 C200 150 300 150 330 200" fill="none" stroke="${c.body}" stroke-width="30" stroke-linecap="round"/>
    <path d="M220 200 L250 290 L280 200" fill="none" stroke="${c.body}" stroke-width="18" stroke-linejoin="round"/>
    ${stitch('M180 196 C206 160 296 160 322 196')}`,
}

const COMBOS = {
  shoe: ['tan', 'espresso', 'black', 'oxblood'],
  bag: ['tan', 'espresso', 'black', 'natural'],
  belt: ['black', 'tan', 'brown'],
  sandal: ['tan', 'black', 'brown'],
}

await mkdir(OUT, { recursive: true })
let count = 0
for (const [shape, colours] of Object.entries(COMBOS)) {
  for (const colour of colours) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 420" role="img">
  <rect width="500" height="420" fill="#efe7d8"/>
  <rect x="14" y="14" width="472" height="392" rx="18" fill="none" stroke="#c8b796" stroke-width="2" stroke-dasharray="8 7"/>
  <ellipse cx="250" cy="340" rx="190" ry="16" fill="#1c1714" opacity=".08"/>
  ${SHAPES[shape](LEATHER[colour])}
</svg>
`
    await writeFile(join(OUT, `${shape}-${colour}.svg`), svg)
    count++
  }
}
console.log(`Wrote ${count} images to public/products/`)
