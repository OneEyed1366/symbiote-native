# Two visual defects the canaries hide by construction — check both before calling a demo broken

Found on device 2026-08-20 and then in **all five** `examples/*` trees. Neither shows up in `tsc`,
a unit test, a lint run, or a screenshot diff against a baseline that already had the bug. Both
read to a user as "the adapter is broken", and in every instance the adapter was fine.

## 1. A row that cannot wrap silently deletes its last control

React Native, like CSS, defaults to `flex-wrap: nowrap`. Three buttons with real titles overflow a
390pt phone, and RN gives **no** scrollbar, no clip indicator, no overflow marker — the third
button is simply not on screen and nothing suggests it exists.

Measured: `.scroll-content` leaves 342pt of content width (390 − 48 of gutters), and ~310pt inside
a `.sc-panel`. Real casualties, one per example:

```
angular   "ping tracked · ping untracked · destroy effect"   ~436pt / 342pt
react     "Unmount · Bump seed prop · skipUpdates: off"      ~436pt / 342pt
vue-sfc   "start scope · stop scope · bump ticks"
vue-tsx   "Start scope · Bump source · Stop scope"           ~389pt / 342pt
svelte    three countStore.* buttons                         ~585pt / 342pt
solid     .row had neither flex-wrap NOR gap
react/*   .sc-chip-row: the third `composes` pill            ~330pt / 310pt
```

Fix: `flex-wrap: wrap` on the shared `.row` / `.row-tight` (and any content-sized row).

**Why it is safe on the other call sites, and how to check:** `flex: 1` implies `flex-basis: 0`,
so a row whose children are all `.flex1` has a hypothetical main size of 0 and can never break a
line — wrapping is a literal no-op there. Most rows in these apps are that shape. Audit the
remainder by measuring, not by eye.

## 2. A state indicator whose two states have the same luminance

A dark palette forgives any hue choice until you need to tell two states apart. Every canary had
at least one toggle whose "on" and "off" fills differed by a hue nudge at identical brightness, so
the binding fired, the engine committed it, and the screen looked dead:

```
angular  .pg-swatch #24304a -> .pg-hb-active #1c3a52
react    .badge     #13243a -> .badge.loud   #0f2a20     ratio 1.03
vue-tsx  same pair                                        ratio 1.03
solid    .ap-pill   #20304f -> .ap-pill-on   #16305a      ratio ~1.00
solid    .ap-item-on #16305a == .ap-panel's own fill      the swap was invisible
```

Same family, different mechanism — **a border-width demo with no border colour**. RN defaults
`borderColor` to BLACK, invisible on a dark panel, so `[style.borderWidth.px]` animating 1→4 drew
four pixels of nothing. And the inverse: an active ring painted in the chip's OWN background
(`#dd0031` ring on a `#dd0031` chip in Angular, `#42b883` on `#42b883` in both Vue examples), so
`onResponderGrant` looked unwired.

Rule for a demo swatch: its state must be legible at arm's length. Two fills that differ only in
hue are not a state indicator. Check contrast, don't eyeball hex.

## The general shape, stated once

**A demo that cannot show its own result reads as a broken feature.** Three more instances the
same day, outside these two categories: a `+ FILTER` caption promising desaturation that iOS never
paints (`enableSwiftUIBasedFilters` is off by default, so only `brightness`/`opacity` land); a
`var()` tile naming a file that declares no custom properties; a `:root` warning firing on the one
construct the docs tell people to write.

So when a canary looks broken, rank the hypotheses in this order:

1. Can the demo express the difference at all? (contrast, wrap, units, platform support)
2. Does the value reach the native prop? (compile the CSS, read the committed tree)
3. Is the adapter wrong?

Three of today's five investigations stopped at step 1.
