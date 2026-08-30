// A press on a LOWERED Pressable must not strand an update to one of its DESCENDANTS.
//
// The regression this pins (2026-08-24, fixed in `commitTargeted`): `setNodePressed` dirties the
// pressed node, so a same-tick prop write on a CHILD bubbles one step, meets the already-dirty
// pressed node and stops there. The targeted commit then published the pressed node's props and
// cleared its flags without descending — leaving the child dirty under a CLEAN chain, which
// `reconcile` skips forever. The screen stopped updating from that node down, permanently, with
// nothing red anywhere.
//
// Why it belongs in the ADAPTER suite and not only in the engine's: the engine's own cases drive
// the node directly, and this defect needs a framework whose update writes ONLY the child — which
// is what Svelte's fine-grained reactivity does and what Vue's and Solid's re-render does NOT (they
// rewrite the prop on the node itself and re-dirty the chain, hiding it by accident). So this is
// the shape that only a real compiled component on the real shim produces.
//
// Read TWO layers. `committed` alone cannot tell a lost commit from a write that never happened,
// and the engine-node reading is what localised the defect the first time.
import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { installFabric, waitUntil } from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}
const fabric = installFabric();

const OUT = join(__dirname, '.smoke-compiled-lowered-press-commit.mjs');
const ROOT_TAG = 9_711;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function pressedNode(): Record<string, unknown> {
  const view = fabric.find(node => {
    const handle = node.instanceHandle;
    return (
      isRecord(handle) &&
      handle.listeners instanceof Map &&
      handle.listeners.has('press')
    );
  });
  const handle = view?.instanceHandle;
  if (!isRecord(handle))
    throw new Error('no lowered Pressable responder found');
  return handle;
}

/** What Fabric holds. */
function committed(): unknown {
  const walk = (nodes: readonly unknown[]): unknown => {
    for (const node of nodes) {
      if (!isRecord(node)) continue;
      const props = node.props;
      if (isRecord(props) && typeof props.testID === 'string')
        return props.testID;
      const children = node.children;
      if (Array.isArray(children)) {
        const hit = walk(children);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
}

/** What the shim wrote onto the engine node, whether or not a commit carried it. */
function onEngineNode(): unknown {
  const children = pressedNode().children;
  if (!Array.isArray(children)) return undefined;
  for (const child of children) {
    if (isRecord(child) && isRecord(child.props)) return child.props.testID;
  }
  return undefined;
}

const SOURCE = [
  `<script>`,
  `  let { onPress, register } = $props();`,
  `  let n = $state(0);`,
  `  register(() => { n += 10; });`,
  `</script>`,
  `<symbiote-pressable p={{onPress: () => { n += 1; onPress(); }}}>`,
  `  <symbiote-view p={{testID: \`v\${n}\`}}></symbiote-view>`,
  `</symbiote-pressable>`,
].join('\n');

describe('a lowered Pressable and its descendants', () => {
  it('keeps committing a child update made in the same tick as a press', async () => {
    let presses = 0;
    let bump: (() => void) | undefined;
    writeFileSync(
      OUT,
      compile(SOURCE, {
        generate: 'client',
        fragments: 'tree',
        css: 'external',
        filename: 'LoweredPressCommit.svelte',
      }).js.code,
    );
    const { default: Probe } = await import(`file://${OUT}`);

    mount(ROOT_TAG, Probe, {
      onPress: () => {
        presses += 1;
      },
      register: (fn: () => void) => {
        bump = fn;
      },
    });
    await settle();
    expect(committed(), 'mounted').toBe('v0');

    // CONTROL, and it is load-bearing: this step must be OBSERVED to move the reading, or nothing
    // below it is attributable to the press (.claude/rules/test-harness-false-greens.md).
    expect(bump, 'the component registered its updater').toBeTypeOf('function');
    bump?.();
    await settle();
    expect(committed(), 'an update outside any press commits').toBe('v10');

    const handle = pressedNode();
    fabric.fireEvent(handle, 'topTouchStart');
    fabric.fireEvent(handle, 'topTouchEnd');
    await waitUntil(() => presses === 1, 'onPress fired');
    await settle();
    expect(onEngineNode(), 'the shim wrote the child prop').toBe('v11');
    expect(committed(), 'and the commit carried it').toBe('v11');

    // The press must not have left the node unreachable: an ordinary update still commits.
    bump?.();
    await settle();
    expect(committed(), 'updates continue after a press').toBe('v21');

    unmount(ROOT_TAG);
    rmSync(OUT, { force: true });
  }, 60_000);
});
