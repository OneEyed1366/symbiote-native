// Verification (svelte-support Check 2): does `$inspect` — pure reactivity machinery with no
// DOM dependency — fire through this adapter's own mount/commit pipeline (build-once-then-
// clone, lazy engine-node creation)? Same compile-real-source-through-svelte/compiler + mount()
// harness as mount-pipeline.smoke.test.ts; see that file's header for why a temp-file dynamic
// import is used instead of a vite-plugin-svelte transform.
//
// FINDING: it does not, in this adapter's REAL build. `$inspect` is not a mount-pipeline defect
// — it is a general svelte/compiler fact: every `$inspect(...)` call is compiled away entirely
// unless `dev: true` is passed to `compile()` (verified directly against svelte@5.56.8, no DOM
// shim involved). metro-svelte-transformer.cjs's `COMPILER_OPTIONS` never sets `dev`, so every
// real Metro build — dev or release — compiles in production mode and silently drops every
// `$inspect` call with no error, no warning, nothing in the output. The two cases below prove
// the split: the first compiles WITHOUT `dev` (this adapter's actual Metro option, and the
// smoke suite's own `COMPILER_OPTIONS` twin) and documents the current no-op; the second passes
// `dev: true` and proves the mount pipeline itself has no problem with `$inspect` once the
// compiler is told to keep it.
//
// NOT fixed here: gating `dev` in metro-svelte-transformer.cjs is a real build-mode decision,
// not a one-line config fix — Svelte's dev codegen adds ownership/binding/mutation validation
// throughout EVERY compiled component (not just ones that use $inspect), which could newly
// throw on patterns this adapter's DOM shim already relies on (skill: "the engine node must be
// LAZY", "build-once-then-clone"), and needs its own env-flag wiring (mirroring this repo's
// DEBUG-gated `dlog`) plus a full pass of the existing component suite before it's safe to flip
// even conditionally. Scope it as a follow-up task, not folded into this verification pass.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

if (globalThis.window === undefined) {
  Object.assign(globalThis, { window: globalThis });
}
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_002;
// Own subfolder, not the bare `__smoke__` dir — vitest runs test FILES in parallel, and a
// shared directory with mount-pipeline.smoke.test.ts meant one file's afterEach
// `rmSync(..., {recursive:true})` could delete a `.mjs` the other file's test had just written
// but not yet dynamic-imported (an intermittent "Cannot find module" failure, unrelated to
// either file's own logic — found running this package's suite as a whole).
const TMP_DIR = join(__dirname, '../build/__smoke__/inspect-rune');

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

let compileCounter = 0;

async function compileComponent(
  source: string,
  name: string,
  dev?: boolean,
): Promise<Component> {
  const result = compile(source, {
    generate: 'client',
    filename: `${name}.svelte`,
    fragments: 'tree',
    css: 'external',
    dev,
  });
  compileCounter += 1;
  const file = join(TMP_DIR, `${name}-${String(compileCounter)}.mjs`);
  writeFileSync(file, result.js.code);
  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`compiled ${name}.svelte produced no default export`);
  }
  return mod.default as Component;
}

// No Negative group: neither compile option throws — the finding is a silent difference in
// compiled OUTPUT, which is exactly why it needed a real-execution test to catch at all (a
// dropped call site produces no error, no warning, nothing `tsc`/`svelte-check` can see).
describe('$inspect under the svelte adapter mount pipeline', () => {
  describe('characterization — svelte/compiler decides this, not this adapter', () => {
    it("does NOT fire under this adapter's real (non-dev) compile options — documents the known gap", async () => {
      // why: this IS the adapter's real Metro compile mode (metro-svelte-transformer.cjs's
      // COMPILER_OPTIONS never sets `dev`) — pins the current, accepted, non-dev-mode behavior
      // so a future compile-option change is caught rather than silently drifting further.
      // QUESTION: gating `dev` in metro-svelte-transformer.cjs is a real build-mode decision
      // (see the file header) — not resolved here, left as a documented gap rather than fixed.
      //
      // The component drives its own second/third render via $effect (same self-driven
      // pattern as mount-pipeline.smoke.test.ts's Counter case) and pushes every $inspect
      // callback invocation onto a global array the test reads back after mounting —
      // $inspect itself has no return value the compiled module could re-export. No `dev`
      // option passed here, matching metro-svelte-transformer.cjs's real COMPILER_OPTIONS.
      (globalThis as { __inspectLog?: number[] }).__inspectLog = [];
      const Counter = await compileComponent(
        `<script>
           let count = $state(0);
           $inspect(count).with((type, value) => { globalThis.__inspectLog.push(value); });
           $effect(() => { if (count < 2) count = count + 1; });
         </script>
         <symbiote-text p={{}}>count {count}</symbiote-text>`,
        'InspectCounter',
      );

      mount(ROOT_TAG, Counter);
      await tick();
      await tick();
      await tick();
      await tick();

      const log =
        (globalThis as { __inspectLog?: number[] }).__inspectLog ?? [];
      // The component itself still renders and re-renders correctly (count reaches 2) — only
      // the $inspect probe is silently gone, proving svelte/compiler stripped the call site
      // rather than the mount pipeline breaking reactivity.
      expect(log).toEqual([]);
      expect(fabric.serialize([fabric.appRoot()])).toContain(
        'RCTRawText "count 2"',
      );
    });
  });

  describe('Positive', () => {
    it('isolation probe: with dev:true passed to svelte/compiler, $inspect DOES fire through this same mount pipeline', async () => {
      // why: confirms the test above is a compile-option fact (svelte/compiler erases every
      // `$inspect` call unless `dev: true`), not a defect in this adapter's own mount/commit
      // path — isolates the mount pipeline as innocent so a future investigation doesn't
      // re-chase it if the compile-option story ever changes.
      (globalThis as { __inspectLog?: number[] }).__inspectLog = [];
      const Counter = await compileComponent(
        `<script>
           let count = $state(0);
           $inspect(count).with((type, value) => { globalThis.__inspectLog.push(value); });
           $effect(() => { if (count < 2) count = count + 1; });
         </script>
         <symbiote-text p={{}}>count {count}</symbiote-text>`,
        'InspectCounterDev',
        true,
      );

      mount(ROOT_TAG, Counter);
      await tick();
      await tick();
      await tick();
      await tick();

      const log =
        (globalThis as { __inspectLog?: number[] }).__inspectLog ?? [];
      expect(log).toEqual([0, 1, 2]);
    });
  });
});
