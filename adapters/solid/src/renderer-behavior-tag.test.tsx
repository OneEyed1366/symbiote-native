// The renderer hands the engine the intrinsic TAG, not only the resolved Fabric name.
//
// The host-behavior registry is keyed by tag (`symbiote-pressable`), while a node only ever carries
// the resolved view name (`RCTView`) — so an adapter that passes only the resolved name makes every
// lookup miss and the machine silently never attaches. Registering under the Fabric name instead
// would be worse: `symbiote-pressable` and a plain `<View>` both resolve to `RCTView`, so every
// View in the app would get a press machine.
//
// This test exists because the renderer's one-line fix is otherwise UNPROVABLE: nothing lowers to
// `symbiote-pressable` yet, so all 447 other Solid tests stay green with the tag argument removed.
// It uses `symbiote-view` for the same reason the real case works — the tag and the resolved
// component genuinely differ — so it keeps testing the right thing after Pressable lands.
import { afterEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  clearHostBehaviors,
  registerHostBehavior,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { mount, unmount } from './render';

installFabric();
const ROOT_TAG = 733;

afterEach(() => {
  unmount(ROOT_TAG);
  clearHostBehaviors();
});

describe('createElement passes the intrinsic tag to the behavior registry', () => {
  it('attaches a behavior registered under the TAG, not under the Fabric name', async () => {
    const attached: ISymbioteNode[] = [];
    registerHostBehavior('symbiote-view', {
      attach: node => {
        attached.push(node);
      },
      detach: () => {},
    });

    mount(ROOT_TAG, () => <symbiote-view testID="probe" />);
    await Promise.resolve();

    expect(attached.length, 'the tag lookup found the behavior').toBe(1);
    expect(
      attached[0]?.component,
      'and the node carries the RESOLVED name',
    ).toBe('RCTView');
  });

  it('does not attach a behavior registered under the resolved Fabric name', () => {
    const attached: ISymbioteNode[] = [];
    registerHostBehavior('RCTView', {
      attach: node => {
        attached.push(node);
      },
      detach: () => {},
    });

    mount(ROOT_TAG, () => <symbiote-view testID="probe" />);

    expect(
      attached.length,
      'RCTView is not a tag — nothing may key on it',
    ).toBe(0);
  });
});
