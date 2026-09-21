// What a tag does with an UNDEFINED prop value, on both channels.
//
// An app writes the key unconditionally and lets the value be `undefined` — `onLayout={maybeFn}`,
// `nativeID={maybeId}` — where a component body used to add it only when defined. That is only safe
// if `undefined` commits NOTHING, and for `onLayout` it is sharper than the general case: it sits
// in GATED_EVENT_PROPS,
// where the engine writes a boolean flag that Fabric's C++ tests before it will emit the event at
// all (`.claude/rules/fabric-boolean-event-gates.md`). A flag lit by an absent handler means native
// emits layout events for the life of the node with nobody listening.
//
// Both channels are covered because they are different code: a gated event reaches the engine
// through setEventListener, a plain prop through setProp. The middle case is the break-test — an
// arm that cannot fail proves nothing, and without it a probe that always found no key would look
// like a pass.
import { describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const ROOT_TAG = 911;
const TARGET = 'gate-probe';
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

// Reset per case: every case opens its OWN surface, and `appRoot()` searches the creation log, so
// without this it answers with the FIRST case's root for the rest of the file.
function probe(): ILiveNode | undefined {
  return live.findLive(live.appRoot(), node => node.payload.testID === TARGET);
}

describe('an undefined-valued gated event on a tag', () => {
  it('reports the committed keys', async () => {
    const absent = undefined;
    fabric.reset();
    mount(ROOT_TAG, () => <view onLayout={absent} testID={TARGET} />);
    await flush();
    const hit = probe();
    expect(hit, 'node not committed').toBeDefined();
    // surfaced through the assertion, not console.log — the CLI wrapper swallows test stdout
    expect(Object.keys(hit?.payload ?? {}).sort()).toEqual(['testID']);
    unmount(ROOT_TAG);
  });

  // Break-test: the arm above must be able to FAIL. A probe whose negative result would hold
  // regardless of the mechanism proves nothing (`verify-the-deciding-side`).
  it('lights the flag for a real handler', async () => {
    fabric.reset();
    mount(ROOT_TAG + 1, () => <view onLayout={() => {}} testID={TARGET} />);
    await flush();
    const hit = probe();
    expect(Object.keys(hit?.payload ?? {}).sort()).toEqual([
      'onLayout',
      'testID',
    ]);
    expect(hit?.payload.onLayout).toBe(true);
    unmount(ROOT_TAG + 1);
  });

  // The OTHER channel. A gated event goes through setEventListener; a plain prop goes through
  // setProp. `nativeID` / `backgroundColor` on InputAccessoryView are the second kind, and a
  // conditional spread lowers to an always-present key whose value is undefined.
  it('commits no key for a plain undefined prop', async () => {
    const absent = undefined;
    fabric.reset();
    mount(ROOT_TAG + 2, () => (
      <view nativeID={absent} backgroundColor={absent} testID={TARGET} />
    ));
    await flush();
    const hit = probe();
    expect(Object.keys(hit?.payload ?? {}).sort()).toEqual(['testID']);
    unmount(ROOT_TAG + 2);
  });
});
