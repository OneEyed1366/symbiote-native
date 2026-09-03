// `Activity` is React's hide-without-unmount: `mode="hidden"` must keep the subtree's state and
// its children alive while it stops painting. The reconciler asks for that through the host
// config's hideInstance/unhideInstance, which were no-ops here — so hidden content went on
// painting, stacked over whatever replaced it, and only Activity's mount half looked like it
// worked. Asserting the committed style, not the call, because a call that writes nothing is
// exactly the bug.

import { Activity, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Text, View, mount, unmount } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 11;

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// Walk the LIVE tree from appRoot(). `fabric.find` searches every node ever created, and Fabric
// clones a node on update — so after any prop change it hands back the pre-clone original and an
// assertion on it silently tests the old value.
function byTestId(id: string): Record<string, unknown> | undefined {
  const walk = (
    nodes: readonly { props: Record<string, unknown>; children: unknown[] }[],
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (node.props.testID === id) return node.props;
      const hit = walk(
        node.children as { props: Record<string, unknown>; children: [] }[],
      );
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
}

// The engine flattens a style array into individual props at commit, so `display` arrives as a
// top-level prop rather than inside a `style` object.
function panelProps(): Record<string, unknown> {
  return byTestId('activity-panel') ?? {};
}

function Panel({ hidden }: { hidden: boolean }): ReactElement {
  return (
    <Activity mode={hidden ? 'hidden' : 'visible'}>
      <View testID="activity-panel" style={{ backgroundColor: '#24304a' }}>
        <Text>panel</Text>
      </View>
    </Activity>
  );
}

function Host(): ReactElement {
  const [hidden, setHidden] = useState(false);
  return (
    <View testID="activity-host" onPress={() => setHidden(value => !value)}>
      <Panel hidden={hidden} />
    </View>
  );
}

describe('Activity hides a subtree without unmounting it', () => {
  it('stops the subtree painting and lets it paint again', () => {
    mount(ROOT_TAG, <Host />);

    expect(panelProps().display).toBeUndefined();

    const host = fabric.find(entry => entry.props.testID === 'activity-host');
    fabric.fireEvent(host?.instanceHandle, 'topTouchStart');
    fabric.fireEvent(host?.instanceHandle, 'topTouchEnd');

    // Hidden, and STILL PRESENT — an unmount would satisfy "stops painting" while destroying the
    // state Activity exists to preserve, so the node has to survive the check.
    expect(panelProps().display).toBe('none');
    expect(byTestId('activity-panel')).toBeDefined();

    fabric.fireEvent(host?.instanceHandle, 'topTouchStart');
    fabric.fireEvent(host?.instanceHandle, 'topTouchEnd');

    // Unhiding CLEARS the flag rather than writing display:'flex' over it, and leaves the
    // author's own style intact — that reversibility is why the slot lives in the engine.
    // `null`, not absent: removing a prop on a Fabric clone means writing null, which is how the
    // platform says "back to the default". Asserting `toBeUndefined()` here fails against a
    // correctly-unhidden node.
    expect(panelProps().display ?? null).toBeNull();
    expect(panelProps().backgroundColor).toBe('#24304a');
  });
});
