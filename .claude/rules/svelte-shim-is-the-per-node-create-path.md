---
paths:
  - 'adapters/svelte/src/dom-shim/*.ts'
  - 'adapters/svelte/src/components/pressable/index.svelte'
---

# Everything in `dom-shim/` runs once per NODE — count allocations before adding one

A 1 000-row benchmark create builds 17 004 shim nodes and drives `ShimElement`'s `p` setter 9 002
times. Anything allocated per call here is allocated tens of thousands of times per screen, and a
profile of that window puts the **garbage collector at ~29% — the largest single bucket**, ahead of
Svelte's own runtime.

Four things were paying that bill, and all four read as ordinary code (2026-08-23):

- a `dlog(\`… ${list.join(',')}\`)` whose argument was built EAGERLY — a Set, two key arrays, a
filter and a template per element, with logging off. **Pass a thunk** (`dlog(() => …)`); debug.ts's
  own header says so and this is the second time the repo has paid for ignoring it.
- a diff helper that materialised a `Set` + spread + filtered array where two `Object.keys` loops
  route the same keys.
- `new Map()` as a field initializer for two maps a lowered primitive never touches — 18 004 per
  create. Lazy them.
- `for (const x of normalizeInsertable(node))`, which boxes the single-node case into a
  one-element array on every insert. Test the fragment flag first.

Net, headless: create window **41.4 → 29.5 ms**. Full mechanism, per-fix numbers, what is left
(Pressable's body and the residual anchors, both priced) and the profiling harness:
**`svelte-adapter-dom-shim` §34**, and `symbiote-perf-measurement` for why a heap sampler must be
off while timing.

Two traps when measuring a change here:

- `for...in` + `Object.hasOwn` is **not** faster than `Object.keys` on these bags — measured, inside
  the noise. Do not "optimise" that way again.
- Profile with `NODE_ENV=production`, or you are profiling Svelte's dev runtime, not the one Metro
  ships.
