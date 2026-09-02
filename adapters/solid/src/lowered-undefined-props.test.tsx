// What a lowered tag does with an UNDEFINED prop value, on both channels.
//
// Tier-1 lowers components whose bodies build props conditionally — React's SafeAreaView adds
// `onLayout` only when it is defined, InputAccessoryView does the same for `nativeID` and
// `backgroundColor`. A transform cannot reproduce a conditional spread, so it emits the key
// unconditionally and lets the value be `undefined`. That is only safe if `undefined` commits
// NOTHING, and for `onLayout` it is sharper than the general case: it sits in GATED_EVENT_PROPS,
// where the engine writes a boolean flag that Fabric's C++ tests before it will emit the event at
// all (`.claude/rules/fabric-boolean-event-gates.md`). A flag lit by an absent handler means native
// emits layout events for the life of the node with nobody listening.
//
// Both channels are covered because they are different code: a gated event reaches the engine
// through setEventListener, a plain prop through setProp. The middle case is the break-test — an
// arm that cannot fail proves nothing, and without it a probe that always found no key would look
// like a pass.
import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const ROOT_TAG = 911;
const TARGET = 'gate-probe';
const fabric = installFabric();
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function find(node: IFakeNode): IFakeNode | undefined {
  if (node.props.testID === TARGET) return node;
  for (const child of node.children) {
    const hit = find(child);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

describe('an undefined-valued gated event on a lowered tag', () => {
  it('reports the committed keys', async () => {
    const absent = undefined;
    mount(ROOT_TAG, () => <symbiote-view onLayout={absent} testID={TARGET} />);
    await flush();
    const hit = fabric.committed.map(find).find(n => n !== undefined);
    expect(hit, 'node not committed').toBeDefined();
    // surfaced through the assertion, not console.log — the CLI wrapper swallows test stdout
    expect(Object.keys(hit?.props ?? {}).sort()).toEqual(['testID']);
    unmount(ROOT_TAG);
  });

  // Break-test: the arm above must be able to FAIL. A probe whose negative result would hold
  // regardless of the mechanism proves nothing (`verify-the-deciding-side`).
  it('lights the flag for a real handler', async () => {
    mount(ROOT_TAG + 1, () => (
      <symbiote-view onLayout={() => {}} testID={TARGET} />
    ));
    await flush();
    const hit = fabric.committed.map(find).find(n => n !== undefined);
    expect(Object.keys(hit?.props ?? {}).sort()).toEqual([
      'onLayout',
      'testID',
    ]);
    expect(hit?.props.onLayout).toBe(true);
    unmount(ROOT_TAG + 1);
  });

  // The OTHER channel. A gated event goes through setEventListener; a plain prop goes through
  // setProp. `nativeID` / `backgroundColor` on InputAccessoryView are the second kind, and a
  // conditional spread lowers to an always-present key whose value is undefined.
  it('commits no key for a plain undefined prop', async () => {
    const absent = undefined;
    mount(ROOT_TAG + 2, () => (
      <symbiote-view
        nativeID={absent}
        backgroundColor={absent}
        testID={TARGET}
      />
    ));
    await flush();
    const hit = fabric.committed.map(find).find(n => n !== undefined);
    expect(Object.keys(hit?.props ?? {}).sort()).toEqual(['testID']);
    unmount(ROOT_TAG + 2);
  });
});
