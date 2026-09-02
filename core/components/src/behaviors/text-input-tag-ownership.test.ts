// ONE owner per node: the machine attaches to the LOWERED tag and must not attach to the tag the
// component wrappers render.
//
// WHY THIS IS THE TEST THAT MATTERS. `registerTextInputBehavior()` installs the whole TextInput
// machine — the focus/blur mirror, the acknowledged event count, the controlled write, autoFocus.
// Every adapter's `TextInput` component runs that same machine in its own lifecycle. The
// host-behavior registry is keyed by TAG, so if the two paths shared one, a wrapper-built node
// would carry both copies: `setInputFocused` twice per focus, `mostRecentEventCount` written from
// two places, and nothing red anywhere — the collision is invisible to every existing suite
// because each half is individually correct.
//
// The split is what prevents it (`component-names/shared.ts`), and a split is only worth as much as
// a test that fails when it is undone. Point `render-text-input.ts` back at the plain tag and the
// second case here goes red.
//
// NOT a `createElement(TAG)` test by accident: `attachHostBehavior` is keyed on the INTRINSIC tag
// the adapter started from, which is exactly the argument `createElement` takes, so this builds the
// subject the way an adapter does (`.claude/rules/test-harness-false-greens.md` §11, where the
// Pressable suite got this wrong and guarded a registration that could never fire).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  appListenerFor,
  createElement,
  createSurface,
  hasHostBehaviors,
  routeProp,
} from '@symbiote-native/engine';
// Relative, not by package name: `core/components` does not declare test-utils, and the neighbour
// suites in this folder import it the same way.
import { installFabric } from '../../../test-utils/src/index';

import { descriptorFor } from '../component-names';
import { registerTextInputBehavior } from './text-input';

const fabric = installFabric();
let nextRootTag = 9400;

const LOWERED = 'symbiote-text-input';
const LOWERED_MULTILINE = 'symbiote-text-input-multiline';
const MANAGED = 'symbiote-text-input-managed';
const MANAGED_MULTILINE = 'symbiote-text-input-multiline-managed';

// Built the way an ADAPTER builds it: the Fabric view name and the intrinsic tag are separate
// arguments, because the node only ever carries the resolved name while the registry is keyed by
// the tag. Passing the tag as the component is the §11 trap — it makes the key match by accident
// and the test then passes against a registration that could never fire in an app.
function mountTag(tag: string) {
  const descriptor = descriptorFor(tag);
  return createElement(descriptor.component, descriptor.isText, tag);
}

// A CAPABILITY oracle, not a shape one: the machine owns `change`, so an app's own `onChange` is
// stashed beside it and reachable through `appListenerFor`. On a node with no behavior the listener
// goes into the ordinary slot and nothing is stashed. That is the difference the split exists to
// produce, stated in terms of what happens to an app's callback.
function hasMachine(tag: string): boolean {
  const node = mountTag(tag);
  const onChange = () => {};
  routeProp(node, 'onChange', onChange);
  return appListenerFor(node, 'change') === onChange;
}

describe('one machine owner per TextInput node', () => {
  beforeEach(() => {
    registerTextInputBehavior();
  });

  it('is registered at all', () => {
    expect(hasHostBehaviors()).toBe(true);
  });

  it('attaches on both lowered tags', () => {
    expect(hasMachine(LOWERED)).toBe(true);
    expect(hasMachine(LOWERED_MULTILINE)).toBe(true);
  });

  // The point of the whole split. Without it the wrapper's own machine and this one both run.
  it('does NOT attach on the tags the component wrappers render', () => {
    expect(hasMachine(MANAGED)).toBe(false);
    expect(hasMachine(MANAGED_MULTILINE)).toBe(false);
  });

  // The split must be free: two tags, one native view, so nothing about what Fabric receives
  // changes. A split that also moved the view would be a regression wearing a fix's clothes.
  it('commits the same native view from either tag', () => {
    expect(descriptorFor(MANAGED).component).toBe(
      descriptorFor(LOWERED).component,
    );
    expect(descriptorFor(MANAGED_MULTILINE).component).toBe(
      descriptorFor(LOWERED_MULTILINE).component,
    );
  });

  // Reading the resolved names off a real commit, not off the map alone: `descriptorFor` agreeing
  // with itself proves the table, and this proves the table is what the commit path uses.
  it('reaches Fabric as the same component from either tag', () => {
    const surface = createSurface((nextRootTag += 1));
    surface.appendChild(mountTag(LOWERED));
    surface.appendChild(mountTag(MANAGED));
    surface.commit();

    const [lowered, managed] = fabric.appRoot().children;
    expect(managed.viewName).toBe(lowered.viewName);
  });
});
