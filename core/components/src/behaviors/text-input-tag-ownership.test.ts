// The TextInput machine attaches to the `text-input` tags and to nothing else.
//
// NOT a `createElement(TAG)` test by accident: `attachHostBehavior` is keyed on the INTRINSIC tag
// the adapter started from, which is exactly the third argument `createElement` takes, so this
// builds the subject the way an adapter does (`.claude/rules/test-harness-false-greens.md` §11,
// where the Pressable suite got this wrong and guarded a registration that could never fire).
//
// What it guards: one owner of the input machine per node. A tag is the only path an app has, so a
// second copy cannot attach beside the engine's.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  appListenerFor,
  createElement,
  hasHostBehaviors,
  routeProp,
  setTreeHost,
} from '@symbiote-native/engine';
// Relative, not by package name: `core/components` does not declare test-utils, and the neighbour
// suites in this folder import it the same way.
import { createRecordingHost } from '../../../test-utils/src/index';

import { descriptorFor } from '../component-names';
import { registerTextInputBehavior } from './text-input';

// A RECORDING host rather than `installFabric()`: this file needs somewhere for a commit to go and
// never reads a tree, so there is no reason for a second implementation of Fabric's tree rules to
// be in its path. Tree questions live in `core/engine/cpp/tests/js`, against the real renderer.
setTreeHost(createRecordingHost());

const SINGLELINE = 'text-input';
const MULTILINE = 'text-input-multiline';

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
// goes into the ordinary slot and nothing is stashed.
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

  it('attaches on both text-input tags', () => {
    expect(hasMachine(SINGLELINE)).toBe(true);
    expect(hasMachine(MULTILINE)).toBe(true);
  });

  // The control: the key really is the tag, so a neighbouring tag resolving to the same Fabric view
  // must NOT pick the machine up. `sticky-header` and `text-input` both commit real views and share
  // nothing else.
  it('does not attach on an unrelated tag', () => {
    expect(hasMachine('sticky-header')).toBe(false);
  });
});
