// A press on a `<pressable>` must not strand an update to one of its DESCENDANTS.
//
// Pins the `commitTargeted` fix: `setNodePressed` dirties the pressed node
// A same-tick child write then bubbles one step and stops at it, so the child was stranded forever

// It needs a framework whose update writes only the child, as Svelte's fine-grained reactivity does
// Vue and Solid rewrite the prop on the node itself and hide the bug
// Two layers are read, as `committed` alone cannot tell a lost commit from a write never made
import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { installRecordingFabric, waitUntil } from '@symbiote-native/test-utils';
import {
  childrenOf,
  hasListenerFor,
  isSymbioteNode,
  propOf,
} from '@symbiote-native/engine';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}
const fabric = installRecordingFabric();

const OUT = join(__dirname, '.smoke-compiled-press-commit.mjs');
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
    return isSymbioteNode(handle) && hasListenerFor(handle, 'press');
  });
  const handle = view?.instanceHandle;
  if (!isRecord(handle)) throw new Error('no pressable responder found');
  return handle;
}

/**
 * What actually reached the recording host through an emitted op — NOT the engine's own live
 * prop value (that's `onEngineNode()`). `find` reads the AUTHORED bag, which only changes when
 * `applyOps` sees an `OP_SET_PROP` for this node, so it lags exactly when a targeted commit skips
 * emitting one — which is the whole defect this file pins.
 */
function committed(): unknown {
  return fabric.find(node => typeof node.props.testID === 'string')?.props
    .testID;
}

/** What the renderer wrote onto the engine node, whether or not a commit carried it. */
function onEngineNode(): unknown {
  // Through the engine's own accessors, not fields: a node's children and its standing props are
  // both DERIVED from the host's tree plus the pending op log, and neither is on the node.
  for (const child of childrenOf(pressedNode() as never)) {
    const testId = propOf(child, 'testID');
    if (testId !== undefined) return testId;
  }
  return undefined;
}

const SOURCE = [
  `<script>`,
  `  let { onPress, register } = $props();`,
  `  let n = $state(0);`,
  `  register(() => { n += 10; });`,
  `</script>`,
  `<pressable p={{onPress: () => { n += 1; onPress(); }}}>`,
  `  <view p={{testID: \`v\${n}\`}}></view>`,
  `</pressable>`,
].join('\n');

describe('a pressable tag and its descendants', () => {
  it('keeps committing a child update made in the same tick as a press', async () => {
    let presses = 0;
    let bump: (() => void) | undefined;
    writeFileSync(
      OUT,
      compile(SOURCE, {
        generate: 'client',
        fragments: 'tree',
        css: 'external',
        filename: 'PressCommit.svelte',
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
    expect(onEngineNode(), 'the renderer wrote the child prop').toBe('v11');
    expect(committed(), 'and the commit carried it').toBe('v11');

    // The press must not have left the node unreachable: an ordinary update still commits.
    bump?.();
    await settle();
    expect(committed(), 'updates continue after a press').toBe('v21');

    unmount(ROOT_TAG);
    rmSync(OUT, { force: true });
  }, 60_000);
});
