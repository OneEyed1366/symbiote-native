// Whether a host behavior is REACHABLE on the React adapter at all.
//
// The registry is keyed by INTRINSIC TAG (`core/engine/src/host-behavior.ts`), and the tag exists
// only as `createElement`'s third argument — the node itself carries the resolved Fabric view name.
// React's host config computed the tag and then dropped it, so every behavior looked up `RCTView`,
// matched nothing, and never attached. Nothing went red: React ships no `register` entry, so there
// has never been a behavior to lose, and a silent miss is indistinguishable from having none.
//
// The two assertions are a pair on purpose. The positive one fails when the tag is dropped; the
// negative one fails when someone "fixes" it by keying the registry on the Fabric name instead —
// which would work for this test's `view` and put a press machine on every View in the app.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import {
  clearHostBehaviors,
  registerHostBehavior,
  type ISymbioteNode,
} from '@symbiote-native/engine';

installFabric();
let nextRootTag = 7400;

function trackAttachesOn(key: string): ISymbioteNode[] {
  const attached: ISymbioteNode[] = [];
  registerHostBehavior(key, {
    attach: node => attached.push(node),
    detach: () => {},
  });
  return attached;
}

afterEach(() => {
  clearHostBehaviors();
});

describe('a behavior registered under an intrinsic tag', () => {
  it('attaches to a node React created for that tag', () => {
    const attached = trackAttachesOn('view');
    const rootTag = (nextRootTag += 1);

    mount(rootTag, <View testID="probe" />);

    // One for the app's View, plus whatever container chrome the surface mounts — the assertion
    // is that the behavior fired at all, and that it fired on a node carrying the RESOLVED name.
    expect(attached.length).toBeGreaterThan(0);
    expect(attached[0]?.component).toBe('RCTView');
    unmount(rootTag);
  });

  // `RCTImageView` and not `RCTView`, and the reason is worth keeping: the surface's own container
  // chrome IS created as a bare `createElement('RCTView')` with no intrinsic tag, so `tag` defaults
  // to the component name and a registration on `RCTView` legitimately claims it. That made the
  // first version of this test fail against correct code — it was reading container chrome as a
  // mis-key. Pick a Fabric name no chrome uses.
  it('does NOT attach when registered under the Fabric view name', () => {
    const attached = trackAttachesOn('RCTImageView');
    const rootTag = (nextRootTag += 1);

    mount(rootTag, <image source={{ uri: 'probe' }} />);

    expect(attached).toEqual([]);
    unmount(rootTag);
  });

  // The other half of the same claim: the `<image>` path really does reach the engine under its
  // intrinsic tag, so the negative above is a statement about KEYING and not about the node
  // never being created.
  it('attaches to that same image node under its intrinsic tag', () => {
    const attached = trackAttachesOn('image');
    const rootTag = (nextRootTag += 1);

    mount(rootTag, <image source={{ uri: 'probe' }} />);

    expect(attached.map(node => node.component)).toEqual(['RCTImageView']);
    unmount(rootTag);
  });
});
