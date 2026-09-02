---
paths:
  - 'core/engine/src/commit.ts'
  - '**/*.bench.ts'
  - 'examples/*/screens/BenchmarkScreen.*'
  - 'examples/*/components/JsFrameRateMeter.*'
---

# A performance claim needs a number, and the right number

Invoke the `symbiote-perf-measurement` skill before optimizing this path or
changing a benchmark. The must-apply points:

- **A per-adapter spread cannot come from shared engine code.** `reconcile` sits
  behind all four adapters, so it adds the same term to each. React 2 frames /
  Vue 1 / Svelte 0 on one screen means the variable part lives above the engine.
  This bounds the walk from ABOVE only — it never proves the walk is cheap.
- **Measured, desktop V8, after dirty-marking landed (2026-08-18):** a no-op commit
  on 9761 nodes is ~0.001 ms and one prop deep in a 10 005-node sectioned screen is
  ~0.063 ms (was 3.4 / 3.2 ms). An unmarked full-tree walk was ~0.5 us/node and ~77%
  of a commit; if a number drifts back toward that, a `markDirty` went missing.
- **A FLAT benchmark tree cannot show a subtree-skip win, and krausest's is flat** —
  a flat parent re-appends all N child handles on any change, which is Fabric's
  protocol, not our walk. Always keep a bushy/sectioned case beside the flat one.
- **Benchmarks run `pnpm bench`** (sets `--max-semi-space-size=64`; without it
  `fabricProps`'s props-object-per-node-per-commit garbage makes results useless:
  105 ms ±91% vs 4.7 ms ±1.6%). Read `min`, not p75 or mean, on the create-shaped rows — GC makes their p75 swing
  ±5% to ±85% run to run.
- **`Remove row` and `Append 1 000` are NOT comparable across adapters yet** — the screen does not
  pin press order, so each acts on whatever row count happened to be on screen. Same adapter, same
  build, two runs: Remove 87-107 ms vs 418.6 ms, Append 953 vs 1678 ms, while Create / Replace /
  Partial / Select / Swap reproduced inside 1-3%. Compare on the reproducible rows and the meter.
- **Operations come verbatim from js-framework-benchmark (krausest)** so numbers
  stay comparable to Vue/Svelte/Solid/Million. Do not invent a nicer set.
- **Device numbers require a release build** — dev-mode JS drowns the signal, by 3-9x. Measured
  2026-08-18, iOS 26.5 simulator, `examples/react`, ~2 000 rows / 17 991 native views:
  Select row 9.3 ms · Partial update 31.8 ms · Create 1 000 rows 254.7 ms · Append 1 000 rows
  345.9 ms (the Debug figures for the same ops are 83 / 140 / 836 / 953 ms).
- **A `DEBUG=1` build measures the logging, not the code.** `dlog` is gated, not free once on: the
  sticky path alone emits ~6 lines per wrapper rebuild, all through the RN bridge into a DevTools
  console that RETAINS every message. Measured 2026-08-18: one drag down `examples/angular`'s
  benchmark screen produced **8 000+ console lines** and drove JS to 1 fps — and a JS thread that
  starved cannot advance a `VirtualizedList` window, so the list goes BLANK while native scrolling
  keeps working. That reads exactly like a rendering bug and is not one.
- **Instrumentation density is NOT a proxy for log volume — read the console's hidden-message counter
  instead.** Counting `dlog` SITES predicts nothing: `adapters/*/src/components/scroll-view` holds 34
  on Angular vs 5 on React, which predicted ~7x the traffic, and the measured per-gesture volume for
  the same drag came out **8 000+ (Angular) vs 6 815 (React)** — 17% apart. Almost all of it
  originates in the SHARED core (303 `dlog` sites there), which both adapters walk. So "adapter X is
  more instrumented" is not an explanation for anything; DevTools' `N hidden` count on an identical
  gesture is the measurement, and it is free to take.
- **When two adapters starve IDENTICALLY, stop measuring throughput and start measuring RECOVERY.**
  Same gesture, same ~7k lines: React AND Angular both bottom out at 1 fps under a hard drag, so the
  stall is the shared logging load and carries no adapter signal at all. What differs is afterwards —
  React renders every cell once the thread catches up; Angular's list stays permanently blank with
  JS and UI both back at 60 fps. A fault that survives the return to idle is a dropped update that
  never re-converges, NOT a slow path, and no amount of optimizing will remove it. Chasing the fps
  number here wastes the run; the question is whether the final state is correct.
- **A prop-key count is THREE layers, and only one of them is the app's CSS.** Measured 2026-08-31
  on one `examples/vue-sfc` BenchmarkRow: 32 keys per row = 23 style declarations + **6 engine-seeded
  RN text defaults** (`ellipsizeMode` + `allowFontScaling`, two per Text) + 3 `text`. A total
  compared against another adapter's total is uninterpretable — the same number is reachable by
  different splits — so decompose before attributing. The middle layer is the one nobody expects: a
  LOWERED `symbiote-text` has no component wrapper to fold RN's `Text.js` defaults, so the adapter
  must seed them (`adapters/vue/src/renderer/index.ts`), and of five adapters only Vue and Solid do.
  A row whose Texts lack those two keys is not leaner, it has lost an RN default — `numberOfLines`
  then clips with no ellipsis.
- **A key count taken off a test fixture's own rules measures the fixture.** `benchmark-row-shape.test.ts`
  registers a hand-simplified `ROW_RULES` (`.bench-row` as 2 declarations where the app's CSS has 10),
  so its flat row reads 18 keys where the real CSS gives 32. Both numbers are correct about different
  things, and neither can be diffed against a device reading. Before comparing two adapters' key
  counts, confirm both sides resolved the SAME rule set — the two apps' `.bench-row*` blocks turned
  out identical, 23 declarations token for token, which is what made the residual attributable at all.
- **The walk is no longer the bottleneck, so stop optimizing it.** Same run, idle/scrolling:
  the reconcile walk is **0.1% of the window, 75 nodes/commit, 0.4 ms/commit** at 60 fps. What
  still costs is native view creation and the flat-parent child-set re-append — Fabric's
  persistent-tree protocol, not our JS. Visible in one comparison: `Select row` 9.3 ms
  (props-only clone) vs `Remove row` 103.3 ms (structural → re-append every child handle).
- **Never leave a non-HostObject on `global.nativeFabricUIManager`.** C++ reads it back on every
  commit and every event dispatch (`UIManagerBinding::getBinding` → `getHostObject<UIManagerBinding>`),
  so a plain object or a Proxy left installed kills the app natively — no red box, JS log ending at
  `Running "<App>"`, looking like a broken build. The JSI call counter every example carries
  (`examples/*/fabric-call-counter.ts`, byte-identical in all six) therefore swaps the global for
  ONE synchronous instant, forces the renderer to bind, and restores in `finally`. Its wrapper also
  copies each host function's `length`: the engine feature-detects the batched-children clone
  bindings by arity, and a `(...args)` wrapper silently reroutes every adapter to the per-child
  `appendChild` path. It costs ~18 000 JS calls on Create 1 000 and is in every timing once
  installed — so it goes on all six examples or none. Mechanism, the stock counts it produced, and
  what it deliberately does not count: `symbiote-perf-measurement`, "Counting JSI calls on BOTH
  stacks".
- **There is a stock-React-Native baseline now: `examples/bare-rn`** — plain RN 0.86, React's own
  Fabric renderer, zero `@symbiote-native/*`, same benchmark screen and same 20 measurement
  constants. It is the only way to answer "compared to what". Its all-mounted column is the clean
  cross-renderer comparison; its virtualized column runs RN's own `FlatList` against our port and
  compares two implementations, not two renderers. Deviation list, the debug numbers, the
  mechanism by which beating stock is legitimate, and the four explanations already ruled out:
  `symbiote-perf-measurement`, "The stock-React-Native baseline".
