// TouchableHighlight over REAL compiled `.svelte` output — the Svelte twin of
// adapters/solid/src/components/touchable/touchable.test.tsx's TouchableHighlight group, written
// for the 2026-08-19 RN audit migration.
//
// SCOPE. The underlay machine itself (createHighlightUnderlayHandlers' show/hold/hide ordering)
// and resolveHighlightExtraStyles are unit-tested in core/components; the press lifecycle
// underneath is ../pressable/pressable.smoke.test.ts. What is SVELTE-specific:
//   - the reactive `shown` cell actually reaching the committed node's style;
//   - RN's _hasPressHandler gate resolved over live props (including onLongPress, which stays in
//     `rest` and is only READ);
//   - the post-press HOLD, which is the whole reason the underlay is a machine and not a
//     `pressed`-derived style — the previous port used `highlightPressedStyle(pressed, ...)` and
//     could not express it;
//   - onShowUnderlay / onHideUnderlay, which no adapter forwarded before the audit;
//   - the structural decision on RN's container/child style split (see that test's own note).
//
// NOT covered, honestly: the visual-then-callback ORDER inside each interceptor. Both halves land
// in the same synchronous call and the visual only reaches the committed tree on a later async
// pass, so a swapped order is indistinguishable here.
//
// No Negative group: TouchableHighlight has no rejecting path.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  installFabric,
  waitUntil,
  type IFakeNode,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_202;
const TARGET = 'highlight-target';
const CHILD = 'highlight-child';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const UNDERLAY = '#abc';
const CHILD_OPACITY = 0.5;
const BASE_WIDTH = 12;
const HOLD_MS = 40;

const COMPONENTS_DIR = join(__dirname, '..');
// `-for-highlight` per .claude/rules/smoke-compiled-artifact-collisions.md: Pressable is compiled
// here but owned by ../pressable/pressable.smoke.test.ts, and vitest runs files concurrently.
const PRESSABLE_OUT = join(
  COMPONENTS_DIR,
  'pressable',
  '.smoke-compiled-pressable-for-highlight.mjs',
);
const HIGHLIGHT_OUT = join(__dirname, '.smoke-compiled-highlight.mjs');
const PARENT_OUT = join(__dirname, '.smoke-compiled-highlight-parent.mjs');

const fabric = installFabric();

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const wait = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
  rewrites: ReadonlyArray<readonly [string, string]> = [],
): void {
  let code = compile(source, { ...COMPILE_OPTIONS, filename }).js.code;
  for (const [from, to] of rewrites) code = code.replace(from, to);
  writeFileSync(outPath, code);
}

async function loadParent(): Promise<Component> {
  compileToFile(
    readFileSync(join(COMPONENTS_DIR, 'pressable', 'index.svelte'), 'utf8'),
    'Pressable.svelte',
    PRESSABLE_OUT,
  );
  compileToFile(
    readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
    'TouchableHighlight.svelte',
    HIGHLIGHT_OUT,
    [
      [
        "from '../pressable/index.svelte'",
        "from '../pressable/.smoke-compiled-pressable-for-highlight.mjs'",
      ],
    ],
  );
  // Every scenario's variance travels through mount()'s props, so one parent file suffices —
  // Node's import() cache would hand back a stale module for a rewritten path anyway.
  compileToFile(
    `<script>
       import TouchableHighlight from './.smoke-compiled-highlight.mjs';
       let props = $props();
     </script>
     <TouchableHighlight {...props}>
       {#snippet children()}
         <symbiote-view p={{ testID: '${CHILD}' }} />
       {/snippet}
     </TouchableHighlight>`,
    'Parent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('Parent.svelte produced no default export');
  }
  return mod.default as Component;
}

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PRESSABLE_OUT, { force: true });
  rmSync(HIGHLIGHT_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  function walk(node: IFakeNode): IFakeNode | undefined {
    if (predicate(node)) return node;
    for (const child of node.children) {
      const hit = walk(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  return walk(fabric.appRoot());
}

// The highlight paints on the responder itself, so the assertion node IS the testID'd one — read
// off the COMMITTED tree, never `fabric.find`, whose creation-log props never see a later clone.
function highlightNode(): IFakeNode {
  const node = findCommitted(n => n.props.testID === TARGET);
  if (node === undefined) throw new Error(`no committed node testID=${TARGET}`);
  return node;
}

function responderHandle(): unknown {
  const node = fabric.find(n => n.props.testID === TARGET);
  if (node === undefined) throw new Error(`no node created testID=${TARGET}`);
  return node.instanceHandle;
}

describe('Svelte TouchableHighlight (real compiled index.svelte)', () => {
  // why: proves the shared underlay machine's `shown` cell reaches the real committed node —
  // underlayColor while held, gone after — and that the caller's base style survives the overlay.
  it('paints underlayColor + activeOpacity while held, and clears on release', async () => {
    const Parent = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      underlayColor: UNDERLAY,
      activeOpacity: CHILD_OPACITY,
      style: { width: BASE_WIDTH },
      onPress: () => {},
    });
    await tick();
    await tick();

    expect(highlightNode().props.backgroundColor).toBeUndefined();
    expect(highlightNode().props.width).toBe(BASE_WIDTH);

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await waitUntil(
      () => highlightNode().props.backgroundColor === UNDERLAY,
      'underlay painted on press-in',
    );
    expect(highlightNode().props.opacity).toBe(CHILD_OPACITY);
    expect(highlightNode().props.width, 'base style survived').toBe(BASE_WIDTH);

    // The hide is ASYNC now, and that is RN: onPress arms a hide timer at delayPressOut (0 here),
    // so the underlay outlives the microtask queue by one macrotask. The pre-audit
    // `pressed`-derived style cleared synchronously with the release.
    fabric.fireEvent(handle, TOUCH_END);
    await waitUntil(
      () => highlightNode().props.backgroundColor === null,
      'underlay cleared after the hold',
    );
  });

  // why: RN's _hasPressHandler gate — a TouchableHighlight with no press callback is decorative,
  // and flashing an underlay under a touch that passes through it is wrong. Invisible to any test
  // that always supplies onPress, which is how it stayed unported.
  it('paints no underlay when no press handler is supplied', async () => {
    const Parent = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      underlayColor: UNDERLAY,
      style: { width: BASE_WIDTH },
    });
    await tick();
    await tick();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await wait(20);
    await tick();
    expect(highlightNode().props.backgroundColor).toBeUndefined();
  });

  // why: onLongPress ALONE satisfies RN's gate, and it is the one handler this component never
  // intercepts — it stays in `rest` and is only read. A port that gates on the three intercepted
  // handlers passes every other test here.
  it('paints the underlay when only onLongPress is supplied', async () => {
    const Parent = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      underlayColor: UNDERLAY,
      onLongPress: () => {},
    });
    await tick();
    await tick();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await waitUntil(
      () => highlightNode().props.backgroundColor === UNDERLAY,
      'underlay painted for an onLongPress-only Touchable',
    );
  });

  // why: THE reason the underlay is a machine and not a `pressed`-derived style. RN re-shows it in
  // onPress and holds it for delayPressOut, so a tap too fast to see still flashes; the pressed
  // flag is already false by then.
  it('holds the underlay past the tap for delayPressOut', async () => {
    const Parent = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      underlayColor: UNDERLAY,
      delayPressOut: HOLD_MS,
      onPress: () => {},
    });
    await tick();
    await tick();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    await tick();
    await tick();
    expect(
      highlightNode().props.backgroundColor,
      'released before the hold elapsed',
    ).toBe(UNDERLAY);

    await waitUntil(
      () => highlightNode().props.backgroundColor === null,
      'underlay released after the hold',
    );
  });

  // why: RN fires these on a real transition only, and no adapter forwarded them at all before the
  // audit. Two shows (press-in, then press re-showing before the hold) then one hide is RN's own
  // sequence, not an artifact.
  it('fires onShowUnderlay and onHideUnderlay around a press', async () => {
    const Parent = await loadParent();
    const seen: string[] = [];
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      onPress: () => {},
      onShowUnderlay: () => seen.push('show'),
      onHideUnderlay: () => seen.push('hide'),
    });
    await tick();
    await tick();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    await waitUntil(() => seen.includes('hide'), 'onHideUnderlay fired');
    expect(seen).toEqual(['show', 'show', 'hide']);
  });

  // why: guards the one place this adapter knowingly diverges from RN. RN clones its single child
  // to put the lowered opacity on the CHILD; a Svelte `Snippet` cannot be cloned or introspected,
  // so the only route to the child is a permanent wrapper View that re-parents the child's `flex`
  // — unmeasurable headless (the fake Fabric runs no Yoga). Both styles therefore stay on the
  // container. This pins the STRUCTURE so the wrapper cannot appear later without the decision
  // being made again, on a device.
  it('keeps the child a DIRECT child and paints both styles on the container', async () => {
    const Parent = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      underlayColor: UNDERLAY,
      activeOpacity: CHILD_OPACITY,
      onPress: () => {},
    });
    await tick();
    await tick();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await waitUntil(
      () => highlightNode().props.backgroundColor === UNDERLAY,
      'underlay painted',
    );

    const container = highlightNode();
    expect(
      container.props.opacity,
      'the child style folded onto the container',
    ).toBe(CHILD_OPACITY);
    expect(container.children.map(n => n.props.testID)).toEqual([CHILD]);
    const child = container.children[0];
    expect(
      child?.props.opacity,
      'the child was styled instead',
    ).toBeUndefined();
  });

  // why: delayPressOut is CONSUMED here (it times the hold), so it must not also ride down to the
  // host as an unknown Fabric prop. The pre-audit port spread it straight through.
  it('does not forward delayPressOut to the host node', async () => {
    const Parent = await loadParent();
    mount(ROOT_TAG, Parent, {
      testID: TARGET,
      delayPressOut: HOLD_MS,
      onPress: () => {},
    });
    await tick();
    await tick();

    expect(highlightNode().props.delayPressOut).toBeUndefined();
    expect(highlightNode().props.onShowUnderlay).toBeUndefined();
    expect(highlightNode().props.onHideUnderlay).toBeUndefined();
  });
});
