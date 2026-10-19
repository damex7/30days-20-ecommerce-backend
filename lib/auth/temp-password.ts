// TEMPORARY PASSWORDS for accounts an admin creates (Day 18).
//
// The admin is shown it ONCE, to hand over in person or on WhatsApp. It is
// never emailed (an inbox is a poor place to keep a password) and never
// stored: only its argon2id hash goes into the database, like any password.
// Its owner must replace it at first sign-in (users.must_change_password),
// so the admin doesn't keep knowing it.
import 'server-only'

import { randomInt } from 'node:crypto'

// About 250 short, common, easy-to-say words: each word picked at random
// adds almost 8 bits. Easy to read aloud over the phone without spelling.
const WORDS = (
  'acre aloe amber anchor apple april arch atlas autumn bake bamboo banjo barn basil beach bean ' +
  'bell berry bird blaze bloom blue boat bolt bread brick bridge brook brush bucket cabin cable ' +
  'cactus cake camel candle canoe canvas cargo carpet cedar chalk charm cherry chess cider cliff ' +
  'clock cloud clover coast cobalt cocoa comet coral cotton cove crane creek crown crystal cube ' +
  'daisy dawn delta desert dew dice dolphin dove drum dune eagle earth echo elbow ember fable ' +
  'falcon fern fiddle field fig flame flint flute fog forest fossil fox frost garden garnet gate ' +
  'gecko ginger glade glass globe goat gold grain grape gravel grove guava hammer harbor harp hawk ' +
  'hazel heron hill honey horizon hut iris island ivory jade jar jasmine jelly jungle kayak kettle ' +
  'kite kiwi koala ladder lagoon lake lamp lantern leaf lemon lily linen lion lotus lunar mango ' +
  'maple marble meadow melon mesa mint mirror monsoon moss moth mountain mule nectar nest noodle ' +
  'nutmeg oak oasis ocean olive onion orbit orchid otter owl paddle palm panda paper parrot pearl ' +
  'pebble pepper piano pillow pine planet plum pond poppy prairie quail quartz quill rabbit radio ' +
  'rain raven reef ribbon river robin rocket rose ruby saddle sage salt sand satin scarf shell ' +
  'silk silver sky slate snow sparrow spice spoon spring spruce star stone storm sugar summit sun ' +
  'swan table tea thistle thunder tiger timber toast topaz tulip tundra turtle umbrella valley ' +
  'velvet violet walnut water wave wheat willow wind winter wolf wool yam yarn zebra zinc'
).split(' ')

/**
 * Three random words and four digits, e.g. "mango-river-slate-4821".
 *
 * randomInt() uses the operating system's cryptographic random generator
 * (never Math.random(), whose output can be predicted). Three words from
 * this list and four digits give about 2^37 possibilities. That is plenty
 * for a password that is rate-limited at login and must be replaced at the
 * first sign-in.
 */
export function generateTemporaryPassword(): string {
  const words = Array.from({ length: 3 }, () => WORDS[randomInt(WORDS.length)] ?? 'braid')
  const digits = String(randomInt(10_000)).padStart(4, '0')
  return [...words, digits].join('-')
}
