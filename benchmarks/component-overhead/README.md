# What a component boundary costs, measured against a constant DOM

Our device numbers price a framework component instance at ~15 us (a thin View/Text wrapper, Vue on
Hermes) and ~50 us (Pressable, Solid). Nothing told us whether those are normal for the framework or
inflated by our own wrapper bodies — and no public benchmark answers it, because
js-framework-benchmark's implementations do not wrap elements in components at all. Its
ratio-to-vanilla column nets out the browser, but there is no component to measure.

These pages supply the missing arm.

```
cd benchmarks/component-overhead && python3 -m http.server 8123
open http://localhost:8123/react.html
open http://localhost:8123/vue.html
```

Over `file://` the pages refuse to run and say why: the shared harness is an ES module, which
Chrome will not load from a file URL.

## The shape, and why it is not one page per framework

One page per framework would compare five separate implementations — the flaw this exists to avoid,
since half of that spread is authorship. Instead each page runs TWO ARMS over the same data in the
same document:

```
arm A   1000 rows x 7 elements, written directly
arm B   the same tree, each element wrapped in a pass-through component
```

The reported number is the DELTA, in microseconds per component instance. A delta is comparable
across pages in a way a total is not.

**The control is the part that makes it evidence.** Every run counts the elements and text nodes
both arms produced and refuses to report a per-instance figure unless they match — the browser twin
of this repo's rule that a Fabric-counter comparison is void unless `createNode` / `appendChild` /
prop-key counts are byte-identical. Two arms that built different DOM are not an A/B.

## Reading the number

The wrappers are deliberately EMPTY: they forward props and return the element. So the figure is the
FLOOR of a component boundary, before any prop fold, state or memoisation. Our own wrappers did
more, so:

```
floor much below 15 us   the boundary is cheap and our wrapper BODIES cost the difference
floor near 15 us         the boundary itself is the cost, and lowering was the only fix
```

Two caveats that belong with any number taken here. V8 is not Hermes, so an absolute microsecond
figure does not transfer to device — the RATIO between a thin wrapper and a fat one does. And Vue's
page measures the `h()` path, not the SFC-compiled one: the SFC compiler gives a raw element
static-prop hoisting and a patch flag that a component never gets, so a template app's arm A would
be faster still and the page UNDERSTATES the real saving. Symbiote already hit that once — a
headless `h()` A/B predicted 12-14% where the device gave 25-29%.

## Not yet here

Solid, Svelte and Angular. All three need a build step: a component only exists after compilation,
and un-compiled Solid is not Solid. Angular would additionally need a caveat that JIT is not what an
AOT app ships.

## First numbers, measured 2026-09-01 (Chrome, V8, this machine)

```
React 18.3.1   under ~1-2 us   ranges OVERLAP at 7000 instances — an upper bound, not zero
Vue 3.5.13     1.6-1.7 us      ranges do not overlap; two runs agreed (1.59, 1.71)
```

Against the device figure this page exists to calibrate — a thin Vue View/Text wrapper at ~15 us on
Hermes — the browser floor is roughly 9x smaller. Three things sit in that gap, and the page cannot
separate them: Hermes is not V8; our wrapper bodies did more than pass through
(`normalizeVueAttrs` per key, `resolveTextProps`); and the device number came off the SFC path,
where the RAW-element arm additionally gets static-prop hoisting and a patch flag that a component
never gets, while this page's `h()` arm gets neither. So 1.7 us is a LOWER bound for what an SFC app
saves per instance.

**The result cross-checks against the adapters, which is what makes it more than a curiosity.**
React's boundary is too cheap to measure — and React's adapter sits at parity with stock React
Native without any lowering, and is the one adapter lowering was never expected to help. Vue's
boundary is real — and Vue gained 25-29% from lowering View/Text. The instrument and the device
agree about which framework had something to win.

So the answer to "are our wrappers anomalously heavy": no. A component boundary is a genuine cost in
the framework itself, and 7-10 of them per row times 1000 rows lands exactly where we measured it.
What lowering removed was not our own inefficiency — it was the boundary.
