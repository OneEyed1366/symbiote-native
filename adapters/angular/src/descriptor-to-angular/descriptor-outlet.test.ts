// DescriptorOutlet (index.ts) is the Angular twin of descriptorToReact/descriptorToVue —
// angular-adapter skill §6: mount → createElement/createText/setProperty/appendChild
// imperatively via Renderer2, then a patchElement/patchChildren diff on every subsequent
// ngOnChanges that PATCHES same-(type,key) nodes in place (`sameElement`) instead of clearing
// and recreating the subtree, preserving retained-node identity for Fabric's clone-on-write
// model (mirrors wolf-tui's WNodeOutlet).
//
// Coverage dictionary (adapters/angular/src/descriptor-to-angular/index.ts):
//   ngOnChanges — the `'node' in changes` / `this.node === undefined` guard is N/A: `node` is
//     the component's ONLY `@Input({ required: true })`, typed `IDescriptor` (not optional), so
//     constructing a call that skips it or supplies `undefined` needs either binding a signal
//     that's never initialized (outside a real product scenario — a required Input isn't
//     supposed to start absent) or an `as` cast to force an illegal value past the type system,
//     which is out of the unit's type contract. Both create/patch dispatch branches are covered.
//   patchRoot — create branch: covered ("renders a Descriptor tree"). Patch branch: covered
//     (every subsequent-render test).
//   createChild/createElement/createText — covered (root + its Text child + raw string on
//     first render).
//   patchElement — same-(type,key) branch: covered (prop/child-content changes below).
//     MISMATCHED branch (replace-not-patch): covered by "replaces the node, losing retained
//     identity, when type or key no longer matches" below — the ORIGINAL file never exercised
//     this at all, despite it being the entire reason `sameElement` exists.
//   patchProps — changed-value branch: covered ("patches same type/key…", width 10→20).
//     Removed-key branch (`setProperty(..., undefined)`): covered by "clears a prop that is no
//     longer supplied" below (new). Unchanged-value branch (skip): covered implicitly by every
//     patch test that leaves `testID` untouched.
//   patchChild — string→string unchanged/changed: changed value covered by "propagates a text
//     value change" below (new; the original file never changed a text child's VALUE, only the
//     parent element's props). string→element / element→string swap: N/A — not reachable from
//     this component's render-fn-authored Descriptor trees in current usage (a given JSX/render
//     position never alternates between a string and an element descriptor across re-renders in
//     any real `@symbiote-native/components` render fn), and constructing it needs no `as` cast
//     but is a pure characterization exercise for a scenario the codebase has no product driver
//     for — left as a documented gap, not invented as a fake scenario.
//   patchChildren — common-index patch: covered. Append branch (`i = common..next.length`):
//     covered by "adds a new child" below (new). Remove branch (`i = common..rendered.length`):
//     covered by "removes a child that is no longer present" below (new).
//   replaceChild — exercised transitively by the new mismatch-replace test.
//   ngOnDestroy — `rendered === undefined` guard: N/A, same reasoning as the ngOnChanges guard
//     (only reachable if destroy fires before any render, not a real product path here since
//     `node` is required). Removal branch: covered by "removes its rendered node from the host
//     once destroyed" below (new; the original file relied on `afterEach(() => unmount(...))`
//     for cleanup but never asserted destroy actually detaches the node).
//   No Negative group: nothing in this unit validates a value at runtime and throws — a
//     malformed Descriptor would violate `IDescriptor`'s own type at the call site, upstream of
//     this component, not inside it.

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { el, txt, type IDescriptor } from '@symbiote-native/components';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ViewHost } from '../primitives';
import { DescriptorOutlet } from './index.ts';

const ROOT_TAG = 904;
const fabric = installFabric();

let capturedHost: DescriptorOutletHost | undefined;

async function flushAngular(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

function currentOutletChild() {
  const child = fabric.appRoot().children[0];
  if (!child) throw new Error('descriptor outlet rendered no root child');
  return child;
}

@Component({
  selector: 'symbiote-descriptor-outlet-host',
  standalone: true,
  imports: [DescriptorOutlet],
  template: '<symbiote-descriptor-outlet [node]="node()" />',
})
class DescriptorOutletHost {
  readonly node = signal<IDescriptor>(
    el('symbiote-view', { testID: 'root', style: { width: 10 } }, [
      txt({}, ['hello']),
    ]),
  );

  constructor() {
    // Captures the live component instance so the test can drive its signals after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  capturedHost = undefined;
  fabric.reset();
});
afterEach(() => unmount(ROOT_TAG));

describe('DescriptorOutlet', () => {
  describe('Positive', () => {
    it('renders a Descriptor tree through Renderer2', async () => {
      mount(ROOT_TAG, DescriptorOutletHost);
      await flushAngular();

      expect(fabric.serialize(fabric.appRoot().children)).toBe(
        'RCTView(RCTText(RCTRawText "hello"))',
      );
      const root = currentOutletChild();
      expect(root.props.testID).toBe('root');
      expect(root.props.width).toBe(10);
    });

    it('does not recommit a structurally identical descriptor through anchor flattening', async () => {
      mount(ROOT_TAG, DescriptorOutletHost);
      await flushAngular();

      const completeRootBefore = fabric.counts.completeRoot;

      // why: two Descriptor trees describing the same content, but built as two SEPARATE
      // object literals (a fresh render fn call), must not force a redundant Fabric commit —
      // otherwise every unrelated re-render of a parent would recommit every descriptor-driven
      // component underneath it, defeating the point of diffing at all.
      capturedHost?.node.set(
        el('symbiote-view', { testID: 'root', style: { width: 10 } }, [
          txt({}, ['hello']),
        ]),
      );
      await flushAngular();

      expect(fabric.counts.completeRoot).toBe(completeRootBefore);
    });

    it('patches same type/key descriptors without recreating the Fabric node', async () => {
      mount(ROOT_TAG, DescriptorOutletHost);
      await flushAngular();

      const before = currentOutletChild();
      const createdBefore = fabric.counts.createNode;

      // why: this is the entire point of DescriptorOutlet over a naive clear-and-rebuild —
      // Fabric's clone-on-write model wants the SAME retained node updated in place, not a
      // fresh `createNode` per re-render.
      capturedHost?.node.set(
        el('symbiote-view', { testID: 'root', style: { width: 20 } }, [
          txt({}, ['hello']),
        ]),
      );
      await flushAngular();

      const after = currentOutletChild();
      expect(fabric.counts.createNode).toBe(createdBefore);
      expect(after.instanceHandle).toBe(before.instanceHandle);
      expect(after.props.width).toBe(20);
    });

    it('clears a prop that is no longer supplied, instead of leaving the stale value behind', async () => {
      mount(ROOT_TAG, DescriptorOutletHost);
      await flushAngular();

      // why: patchProps's removed-key branch (`setProperty(key, undefined)`) is the only thing
      // that stops a prop from "sticking" once a render fn stops supplying it — e.g. a style
      // key that only applies conditionally. Every other test in this file only ever CHANGES or
      // KEEPS existing prop keys, so this branch had zero coverage before.
      capturedHost?.node.set(
        el('symbiote-view', { testID: 'root' }, [txt({}, ['hello'])]),
      );
      await flushAngular();

      const root = currentOutletChild();
      // fake-fabric's own header comment: a removed key arrives as literal `null` and stays
      // `null` (mirrors real Fabric's clone-on-write diff semantics), it is not deleted from
      // the props object entirely — so `null`, not `undefined`, is the correct expectation.
      expect(root.props.width).toBeNull();
      expect(root.props.testID).toBe('root');
    });

    it('propagates a text value change to the already-rendered text node', async () => {
      mount(ROOT_TAG, DescriptorOutletHost);
      await flushAngular();

      // why: patchChild's string-vs-string branch (`setValue` on the existing text node) is
      // what makes text content reactive at all — every other test in this file leaves the
      // child string "hello" untouched across renders, changing only the PARENT's props.
      capturedHost?.node.set(
        el('symbiote-view', { testID: 'root', style: { width: 10 } }, [
          txt({}, ['goodbye']),
        ]),
      );
      await flushAngular();

      expect(fabric.serialize(fabric.appRoot().children)).toBe(
        'RCTView(RCTText(RCTRawText "goodbye"))',
      );
    });

    it('adds a new child without touching the ones that already existed', async () => {
      mount(ROOT_TAG, DescriptorOutletHost);
      await flushAngular();

      const before = currentOutletChild();
      const firstChildBefore = before.children[0];

      // why: patchChildren's append branch (index range beyond the previously-rendered common
      // length) must create ONLY the new child — a bug here (e.g. falling back to
      // clear-and-rebuild) would recreate the first child too, losing its retained identity.
      capturedHost?.node.set(
        el('symbiote-view', { testID: 'root', style: { width: 10 } }, [
          txt({}, ['hello']),
          txt({}, ['world']),
        ]),
      );
      await flushAngular();

      const root = currentOutletChild();
      expect(fabric.serialize([root])).toBe(
        'RCTView(RCTText(RCTRawText "hello")RCTText(RCTRawText "world"))',
      );
      expect(root.children[0]).toBe(firstChildBefore);
    });

    it('removes a child that is no longer present, without disturbing the one that survives', async () => {
      @Component({
        selector: 'symbiote-descriptor-outlet-host-two-children',
        standalone: true,
        imports: [DescriptorOutlet],
        template: '<symbiote-descriptor-outlet [node]="node()" />',
      })
      class TwoChildHost {
        readonly node = signal<IDescriptor>(
          el('symbiote-view', { testID: 'root' }, [
            txt({}, ['hello']),
            txt({}, ['world']),
          ]),
        );

        constructor() {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          capturedTwoChildHost = this;
        }
      }
      let capturedTwoChildHost: TwoChildHost | undefined;

      mount(ROOT_TAG, TwoChildHost);
      await flushAngular();
      const survivingChildBefore = currentOutletChild().children[0];

      // why: patchChildren's remove branch (rendered children beyond the new, shorter list)
      // must `removeChild` exactly the trailing ones — the surviving first child keeps its
      // Fabric identity, it is not cleared and recreated as a side effect of the shrink.
      capturedTwoChildHost?.node.set(
        el('symbiote-view', { testID: 'root' }, [txt({}, ['hello'])]),
      );
      await flushAngular();

      const root = currentOutletChild();
      expect(fabric.serialize([root])).toBe(
        'RCTView(RCTText(RCTRawText "hello"))',
      );
      expect(root.children[0]).toBe(survivingChildBefore);
    });

    it('replaces the node, losing retained identity, when type or key no longer matches', async () => {
      mount(ROOT_TAG, DescriptorOutletHost);
      await flushAngular();

      const before = currentOutletChild();
      const createdBefore = fabric.counts.createNode;

      // why: `sameElement` gates patch-in-place vs replace specifically on `(type, key)` — a
      // root descriptor switching to a DIFFERENT host type is not a prop change to reconcile in
      // place, it is a genuinely different element, so it must go through createElement +
      // replaceChild and get a fresh Fabric identity. This is the branch `sameElement` exists
      // to protect and the original file never exercised it.
      capturedHost?.node.set(
        el('symbiote-text', { testID: 'root' }, ['replaced']),
      );
      await flushAngular();

      const after = currentOutletChild();
      expect(fabric.counts.createNode).toBeGreaterThan(createdBefore);
      expect(after.instanceHandle).not.toBe(before.instanceHandle);
      expect(fabric.serialize([after])).toBe('RCTText(RCTRawText "replaced")');
    });

    it('removes its rendered node from a still-mounted parent once destroyed', async () => {
      @Component({
        selector: 'symbiote-descriptor-outlet-host-conditional',
        standalone: true,
        imports: [ViewHost, DescriptorOutlet],
        template: `
          <View testID="parent">
            @if (visible()) {
              <symbiote-descriptor-outlet [node]="node()" />
            }
          </View>
        `,
      })
      class ConditionalHost {
        readonly visible = signal(true);
        readonly node = signal<IDescriptor>(
          el('symbiote-view', { testID: 'child' }, []),
        );

        constructor() {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          capturedConditionalHost = this;
        }
      }
      let capturedConditionalHost: ConditionalHost | undefined;

      mount(ROOT_TAG, ConditionalHost);
      await flushAngular();
      const parent = fabric.appRoot().children[0];
      if (!parent) throw new Error('parent View did not render');
      expect(parent.children).toHaveLength(1);

      // why: ngOnDestroy must detach the node it created from the OUTLET's own host — the
      // product scenario this defends against is a conditionally-mounted DescriptorOutlet
      // (`@if`) toggling off while the REST of the app stays mounted; a missed removeChild
      // would leak the native view behind, still visually present, even though the caller
      // believes it is gone. `afterEach(() => unmount(ROOT_TAG))` alone (the original file's
      // only cleanup) never proves this — it tears down the whole surface, which doesn't
      // exercise this component's OWN destroy path in isolation.
      capturedConditionalHost?.visible.set(false);
      await flushAngular();

      // Fabric's clone-on-write means removal commits a NEW parent object (children reset via
      // `cloneNodeWithNewChildren`) — re-reading from the freshly committed tree, not the
      // stale `parent` reference captured above, which still points at the pre-removal clone.
      const parentAfter = fabric.appRoot().children[0];
      if (!parentAfter)
        throw new Error('parent View did not survive the toggle');
      expect(parentAfter.children).toHaveLength(0);
    });
  });
});
