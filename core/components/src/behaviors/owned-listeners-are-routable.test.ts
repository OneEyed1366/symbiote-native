// THE SET DIFFERENCE, as a test rather than as a command someone remembers to run:
//
//   ownedListeners  MINUS  (BASE_EVENTS + COMPONENT_EVENTS[component] + RESPONDER_EVENTS)
//
// Anything left over is DEAD on a lowered element and fine on the component path, which is why it
// survives every other check. `routeProp` hands an `on*` prop to `setEventListener` — and so to the
// behavior's stash — only for a registered event; a name that misses falls through to `setProp` and
// sits in `node.props`, where a machine that reads the stash never looks. A wrapper passes the same
// callback to the machine directly and stays correct, so the two paths disagree in silence.
//
// Found by the gap it left: `pressMove` was the one name of the press machine's eight in neither
// engine list, so a lowered `<Pressable @press-move>` highlighted on press (that is `activeStyle`,
// engine-side) while its dx/dy readout never moved. Device-reported on `examples/vue-sfc`,
// 2026-09-02.
//
// DERIVED on both axes — the tags come off `HOST_PRIMITIVES` and the names off each registered
// behavior — so a primitive or an owned name added later joins this audit by existing. A
// hand-written list is the failure this file exists to prevent, one level up.
import { beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '../../../test-utils/src/index';
import {
  appListenerFor,
  clearHostBehaviors,
  createElement,
  hostBehaviorFor,
  routeProp,
} from '@symbiote-native/engine';
import { HOST_PRIMITIVES } from '../../host-primitives.cjs';

import { descriptorFor } from '../component-names/index';
import { registerImageBehavior } from './image';
import { registerInputAccessoryViewBehavior } from './input-accessory-view';
import { registerPressableBehavior } from './pressable';
import { registerSwitchBehavior } from './switch';
import { registerTextInputBehavior } from './text-input';

const fabric = installFabric();

function everyLoweredTag(): string[] {
  return Object.values(HOST_PRIMITIVES).flatMap(spec =>
    spec.intrinsicWhen === undefined
      ? [spec.intrinsic]
      : [spec.intrinsic, spec.intrinsicWhen.intrinsic],
  );
}

const onProp = (event: string): string =>
  `on${event[0].toUpperCase()}${event.slice(1)}`;

beforeEach(() => {
  fabric.reset();
  clearHostBehaviors();
  registerPressableBehavior();
  registerTextInputBehavior();
  registerSwitchBehavior();
  registerImageBehavior();
  registerInputAccessoryViewBehavior();
});

describe('every name a behavior owns is routable to its stash', () => {
  it('leaves nothing in the difference', () => {
    const dead: string[] = [];
    let checked = 0;

    for (const tag of everyLoweredTag()) {
      const owned = hostBehaviorFor(tag)?.ownedListeners ?? [];
      for (const event of owned) {
        const node = createElement(descriptorFor(tag).component, false, tag);
        const listener = (): void => {};
        routeProp(node, onProp(event), listener);
        checked += 1;
        if (appListenerFor(node, event) !== listener) {
          dead.push(`${tag} · ${onProp(event)}`);
        }
      }
    }

    // The harness has to be shown to be doing work: an empty `dead` list means the same thing as a
    // run that examined nothing, and the tag/name derivation is exactly where that could happen.
    expect({ dead, checked }).toEqual({ dead: [], checked });
    // 15 pairs today: the press machine's 8, TextInput's 3 on each of its two tags, Switch's 1.
    // Image and InputAccessoryView own no listeners — they are prop folds only.
    expect(checked).toBeGreaterThan(0);
  });
});
