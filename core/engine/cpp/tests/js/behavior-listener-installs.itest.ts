// How many listener closures each tag's `attach` still installs per node, and the list of the ones
// that have not moved to the shared `IEventDispatch` yet

// An install is ~147 B and a fresh closure every mount (`touchable-attach-cost.itest.ts` case 4),
// where a dispatch is one pointer at a module-level object. The debt list below SHRINKS

import { createElement, type ISymbioteNode } from '@symbiote-native/engine';
import { takeBatch } from '@symbiote-native/engine/mutation-buffer';
import '@symbiote-native/components/register';

import { describe, expect, it, print, report } from './harness';

// Every tag an app can author, with the Fabric view name an adapter resolves it to. The pairs are
// spelled out rather than derived, т.к. a registry walk would report whatever the registry holds
// and this asks whether that is what it should hold
const TAGS: ReadonlyArray<readonly [string, string]> = [
  ['image', 'RCTImageView'],
  ['image-background', 'RCTView'],
  ['input-accessory-view', 'RCTInputAccessoryView'],
  ['pressable', 'RCTView'],
  ['touchable-opacity', 'RCTView'],
  ['touchable-highlight', 'RCTView'],
  ['button', 'RCTView'],
  ['activity-indicator', 'RCTView'],
  ['text-input', 'RCTSinglelineTextInputView'],
  ['text-input-multiline', 'RCTMultilineTextInputView'],
  ['switch', 'RCTSwitch'],
  ['refresh-control', 'RCTRefreshControl'],
  ['scroll-view', 'RCTScrollView'],
  ['horizontal-scroll-view', 'RCTScrollView'],
  ['sticky-header', 'RCTView'],
];

// A GATED name (`GATED_EVENT_PROPS`) cannot move to a dispatch: the install is ALSO the payload
// write that makes Fabric fire the event at all, and a dispatch writes no payload. `sticky-header`
// takes the owner's `layout` that way
const GATED_INSTALLS: ReadonlyMap<string, number> = new Map([
  ['sticky-header', 1],
]);

// THE DEBT LIST, not an expectation: each entry would be a behavior still installing a closure per
// name. Empty, and a behavior that adds one makes this case red before it reaches a list
const STILL_INSTALLING: ReadonlyMap<string, number> = new Map();

function installsOn(tag: string, component: string): number {
  const node: ISymbioteNode = createElement(component, false, tag);
  const count = node.listeners?.size ?? 0;
  takeBatch();
  return count;
}

describe('what a behavior installs on the node it attaches to', () => {
  it('installs nothing per name except where the debt list says so', () => {
    const counts = new Map<string, number>();
    for (const [tag, component] of TAGS) {
      counts.set(tag, installsOn(tag, component));
    }
    const installing = [...counts]
      .filter(([, count]) => count > 0)
      .map(([tag, count]) => `${tag} ${count}`)
      .join(' · ');
    print(`DEBUG INSTALLS ${installing}`);

    for (const [tag] of TAGS) {
      const allowed =
        (GATED_INSTALLS.get(tag) ?? 0) + (STILL_INSTALLING.get(tag) ?? 0);
      expect(counts.get(tag) ?? 0).toBe(allowed);
    }
  });
});

report();
