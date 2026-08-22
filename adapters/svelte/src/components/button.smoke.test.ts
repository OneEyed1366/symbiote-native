// Runtime proof for the deepest composition chain in this family — Button -> TouchableOpacity ->
// Pressable, three real compiled `.svelte` files nested through spread props and snippet-as-prop
// wiring (`{...accessibilityRest} {...nativeForward}` onto TouchableOpacity, `{#snippet
// children()}` passed through two more layers to Pressable) — a shape pure `svelte/compiler`
// syntax-checking cannot catch (it does not execute the compiled output). Compiles all three real
// sources, mounts them nested, and drives a press through the whole chain against a real
// fake-Fabric recorder.
//
// Coverage ledger (per CLAUDE.md's <components_split_logic_view_lifecycle> — Button has no
// `renderButton()` in core/components at all, it is adapter-assembled per
// component-render-fn-boundary.md's rule, composing TouchableOpacity + a raw symbiote-text):
//   - `resolveButtonTextStyle(color, disabled)` (the color-tint / disabled-grey fold) — this
//     file only asserts its OUTPUT indirectly is applied (title paints); it does not assert the
//     tint/grey branches themselves. characterization: no test anywhere in the repo (core or any
//     adapter) exercises `resolveButtonTextStyle`'s branches directly — flagged as a real upstream
//     gap, not duplicated here per the "don't re-test core logic" rule, but also not silently
//     assumed correct. See `// QUESTION:` on the disabled test below.
//   - `BUTTON_ACCESSIBILITY_ROLE` / the fixed accessible=true / accessibilityState={disabled} fold
//     applied AFTER the caller's own accessibility spread — covered below (second test).
//   - the caller's `{...accessibilityRest}` passing through underneath Button's own fixed fields —
//     covered indirectly (role/accessible read off the committed node), not separately asserted
//     for override order — N/A: this is Svelte's own prop-spread-order semantics (last object
//     wins), not adapter logic; testing it would test the Svelte compiler, not this component.
//   - `nativeForward`'s native-only TV-focus/testID passthrough fields — N/A: plain conditional
//     forwarding with no adapter-specific transform, and TV-focus is inert on a phone target.
//   - the composition chain itself (Button -> TouchableOpacity -> Pressable, spread props,
//     snippet-as-prop) and a real press round-trip — covered below (first test).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_004;
// A name distinct from pressable.smoke.test.ts's own `.smoke-compiled-pressable.mjs` in that SAME
// directory — Vitest runs test files concurrently, and that suite deletes its copy in afterEach
// while also rewriting it with a `disabled` variant mid-run. Sharing the path meant this suite
// could import a file the other one had just removed or replaced. Same reasoning, and the same
// `-for-<consumer>` spelling, as flat-list.smoke.test.ts's LIST_OUT.
const PRESSABLE_OUT = join(
  __dirname,
  'pressable',
  '.smoke-compiled-pressable-for-button.mjs',
);
// TouchableOpacity's feedback node is an Animated.View wrapping the real View.svelte, so View
// has to be compiled here too — `-for-button` for the same concurrency reason as PRESSABLE_OUT.
const VIEW_OUT = join(__dirname, '.smoke-compiled-view-for-button.mjs');
const TOUCHABLE_OPACITY_OUT = join(
  __dirname,
  'touchable-opacity',
  '.smoke-compiled-touchable-opacity.mjs',
);
const BUTTON_OUT = join(__dirname, '.smoke-compiled-button.mjs');

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// TouchableOpacity's press feedback is a real Animated.timing (RN's own), and the drivers read
// requestAnimationFrame off the host at call time, THROWING when it is absent
// (core/engine/src/animated/animations/raf.ts). A setTimeout-backed frame is enough here: this
// suite asserts the composition chain and the press callbacks, never the fade's own values.
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const frame = pendingFrames.get(id);
        if (frame === undefined) return;
        pendingFrames.delete(id);
        frame(id * 16);
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

beforeEach(() => {
  fabric.reset();
  pendingFrames.clear();
  installRequestAnimationFrame();
});

afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  rmSync(PRESSABLE_OUT, { force: true });
  rmSync(VIEW_OUT, { force: true });
  rmSync(TOUCHABLE_OPACITY_OUT, { force: true });
  rmSync(BUTTON_OUT, { force: true });
});

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function loadButton(): Promise<Component> {
  // Compile Pressable and TouchableOpacity co-located with their own real siblings first (each
  // has its own relative imports — switch-platform-style resolution — that must resolve next to
  // the compiled file, not in an isolated temp dir), THEN Button, whose own `./touchable-opacity/
  // index.svelte` import is rewritten to point at the compiled TouchableOpacity output.
  compileToFile(
    readFileSync(join(__dirname, 'pressable', 'index.svelte'), 'utf8'),
    'Pressable.svelte',
    PRESSABLE_OUT,
  );
  compileToFile(
    readFileSync(join(__dirname, 'View.svelte'), 'utf8'),
    'View.svelte',
    VIEW_OUT,
  );
  const touchableOpacitySource = readFileSync(
    join(__dirname, 'touchable-opacity', 'index.svelte'),
    'utf8',
  )
    .replace(
      "'../pressable/index.svelte'",
      "'../pressable/.smoke-compiled-pressable-for-button.mjs'",
    )
    .replace("'../View.svelte'", "'../.smoke-compiled-view-for-button.mjs'");
  compileToFile(
    touchableOpacitySource,
    'TouchableOpacity.svelte',
    TOUCHABLE_OPACITY_OUT,
  );

  const buttonSource = readFileSync(
    join(__dirname, 'button.svelte'),
    'utf8',
  ).replace(
    "'./touchable-opacity/index.svelte'",
    "'./touchable-opacity/.smoke-compiled-touchable-opacity.mjs'",
  );
  compileToFile(buttonSource, 'Button.svelte', BUTTON_OUT);

  const mod: unknown = await import(`file://${BUTTON_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('button.svelte produced no default export');
  }
  return mod.default as Component;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function responderHandle(): unknown {
  const view = fabric.find(n => {
    if (n.viewName !== 'RCTView') return false;
    const handle = n.instanceHandle;
    return (
      isRecord(handle) &&
      handle.listeners instanceof Map &&
      handle.listeners.has('press')
    );
  });
  if (view === undefined) throw new Error('no Button responder RCTView found');
  return view.instanceHandle;
}

describe('Button (real compiled button.svelte -> TouchableOpacity -> Pressable)', () => {
  // No Negative group: Button has no guard clause of its own (disabled routes THROUGH
  // Pressable's own suppression, never a thrown error) — every IButtonProps value the type
  // allows renders and mounts.
  describe('Positive (renders through the full composition chain and responds to touch)', () => {
    // why: proves the three-file composition chain (spread props across two layers + a snippet
    // passed through as a prop) actually wires end to end — a shape only real compiled output
    // can prove, not `tsc` or a syntax check. Also proves onPress reaches the caller through
    // TouchableOpacity's and Pressable's own press machinery, unmodified by Button.
    it('mounts the full chain, paints the title, and fires onPress through it', async () => {
      let presses = 0;
      const Button = await loadButton();
      mount(ROOT_TAG, Button, {
        title: 'OK',
        onPress: () => {
          presses++;
        },
      });
      await tick();
      await tick();

      const tree = fabric.serialize([fabric.appRoot()]);
      expect(tree).toContain('RCTText');
      expect(tree).toContain('RCTRawText "OK"');

      const handle = responderHandle();
      fabric.fireEvent(handle, 'topTouchStart');
      fabric.fireEvent(handle, 'topTouchEnd');
      await tick();
      await tick();

      expect(presses).toBe(1);
    });

    // why: RN's Button.js contract — role=button, accessible=true, and the disabled
    // accessibilityState fold are Button's OWN fixed fields, applied AFTER the caller's
    // accessibility spread, so a caller cannot accidentally clobber them.
    it('gives the responder role=button, accessible, and a disabled a11y state', async () => {
      const Button = await loadButton();
      mount(ROOT_TAG, Button, {
        title: 'Go',
        disabled: true,
        onPress: () => {},
      });
      await tick();
      await tick();

      // A disabled Pressable suppresses its listeners entirely (shouldSuppressPress), so this
      // reads the role/accessible/accessibilityState fold straight off the committed view by its
      // fixed accessibilityRole instead of the 'press'-listener lookup responderHandle() uses.
      const view = fabric.find(
        n => n.viewName === 'RCTView' && n.props.accessibilityRole === 'button',
      );
      expect(view).toBeDefined();
      expect(view?.props.accessible).toBe(true);
      const state = view?.props.accessibilityState;
      expect(isRecord(state) && state.disabled).toBe(true);
    });
  });
});
