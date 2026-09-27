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
//
// On `installRecordingFabric()`, not the mirror — a prior pass judged the no-op-commit dedup
// ("does not recommit a structurally identical descriptor") applier-only, on the theory that only
// `tree-applier.ts`'s own `sameNodes` decides it. That is wrong: the SAME dedup is real production
// code, `hasChangedSinceCommit()` (core/engine/src/mutation-buffer.ts) gating `commitSurfaceOps`
// (tree-host.ts) — a commit only reaches EITHER host when at least one non-OP_COMMIT op was pushed
// since the last drain. The recording host's own `commits` counter (incremented per `OP_COMMIT` it
// receives) answers the exact same question the mirror's `fabric.counts.completeRoot` did, for the
// same reason: if DescriptorOutlet's patch correctly no-ops on a structurally identical tree, no
// mutation op is pushed at all, `hasChangedSinceCommit()` stays false, and NEITHER host ever sees
// an `OP_COMMIT` — there is nothing here only the applier can tell apart.

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { el, txt, type IDescriptor } from '@symbiote-native/components';
import type { SymbioteSurface } from '@symbiote-native/engine';
import {
  installRecordingFabric,
  payloadOf,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ViewHost } from '../primitives';
import { DescriptorOutlet } from './index.ts';

const ROOT_TAG = 904;
const fabric = installRecordingFabric();

let capturedHost: DescriptorOutletHost | undefined;
let liveSurface: SymbioteSurface | undefined;

async function flushAngular(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

function mountHost(
  rootComponent: Parameters<typeof mount>[1],
): SymbioteSurface {
  liveSurface = mount(ROOT_TAG, rootComponent);
  return liveSurface;
}

function nodeOf(handle: object): IAuthoredNode {
  const found = fabric.find(node => node.handle === handle);
  if (found === undefined)
    throw new Error('handle missing from the creation log');
  return found;
}

// Every Angular component boundary — DescriptorOutlet's own host, `@if`'s view-container marker —
// commits as an ANCHOR (an authored `viewName === ''`, `OP_CREATE_ANCHOR`'s own spelling), and the
// recording host deliberately does NOT flatten it away the way a real committed Fabric tree would:
// "It does not decide what COMMITS: no flattening" (recording-host.ts's own docstring). So reading
// "the outlet's real rendered content" here means walking past every anchor to what Fabric would
// actually paint, same as the retired mirror's own anchor-flattened `appRoot()` did.
function unwrapAnchors(handles: readonly object[]): object[] {
  const out: object[] = [];
  for (const handle of handles) {
    const found = nodeOf(handle);
    if (found.viewName === '')
      out.push(...unwrapAnchors(fabric.childrenOf(handle)));
    else out.push(handle);
  }
  return out;
}

function currentOutletChild(): IAuthoredNode {
  const handle =
    liveSurface === undefined
      ? undefined
      : unwrapAnchors(liveSurface.children)[0];
  if (handle === undefined)
    throw new Error('descriptor outlet rendered no root child');
  return nodeOf(handle);
}

// Real view names, not native class strings: the recording host stores the AUTHORED op stream's
// own names verbatim, and the engine's `mutation-buffer.ts` authors real native class strings
// ('RCTView', 'RCTText', 'RCTRawText') — same ones a committed Fabric tree would resolve to, unlike
// the short debug names `committedTree()` reports (see the itest suite's ScrollView/TextInput
// findings, which are about Fabric's OWN read-back, a different layer than what was authored).
function serialize(handles: readonly object[]): string {
  return unwrapAnchors(handles)
    .map(handle => {
      const found = nodeOf(handle);
      if (found.viewName === 'RCTRawText') {
        return `RCTRawText "${String(found.props.text)}"`;
      }
      const children = fabric.childrenOf(handle);
      const inner = children.length > 0 ? `(${serialize(children)})` : '';
      return `${found.viewName}${inner}`;
    })
    .join('');
}

// The recording host's own creation log, filtered to real views — an anchor is recorded too but
// Fabric is never asked to create one (its authored `viewName` is the empty string
// `OP_CREATE_ANCHOR` gives it), so it does not belong in a `createNode` count.
function createdCount(): number {
  return fabric.findAll(node => node.viewName !== '').length;
}

@Component({
  selector: 'symbiote-descriptor-outlet-host',
  standalone: true,
  imports: [DescriptorOutlet],
  template: '<symbiote-descriptor-outlet [node]="node()" />',
})
class DescriptorOutletHost {
  readonly node = signal<IDescriptor>(
    el('view', { testID: 'root', style: { width: 10 } }, [txt({}, ['hello'])]),
  );

  constructor() {
    // Captures the live component instance so the test can drive its signals after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  capturedHost = undefined;
  liveSurface = undefined;
  fabric.reset();
});
afterEach(() => unmount(ROOT_TAG));

describe('DescriptorOutlet', () => {
  describe('Positive', () => {
    it('renders a Descriptor tree through Renderer2', async () => {
      mountHost(DescriptorOutletHost);
      await flushAngular();

      expect(liveSurface?.children && serialize(liveSurface.children)).toBe(
        'RCTView(RCTText(RCTRawText "hello"))',
      );
      const root = currentOutletChild();
      expect(root.props.testID).toBe('root');
      // `width` lives nested inside the AUTHORED `style` prop, not flattened at this layer —
      // `payloadOf` is what applies the same style-flattening a committed Fabric payload would.
      expect(payloadOf(root.handle).width).toBe(10);
    });

    // This test's subject is `createdCount` — that `sameElement`'s (type, key) match means PATCH and
    // not replace, so no new Fabric node comes out of a prop rewrite. That has never changed.
    //
    // The engine refuses this write in JS: `routeProp`'s style branch compares a rebuilt style
    // against the standing one key for key (`isSameShallowStyle`) and returns without recording
    // anything — nothing about DescriptorOutlet itself does the deduping.
    it('does not commit at all when a prop object is rebuilt with identical content', async () => {
      mountHost(DescriptorOutletHost);
      await flushAngular();

      const commitsBefore = fabric.commits;
      const createdBefore = createdCount();

      capturedHost?.node.set(
        el('view', { testID: 'root', style: { width: 10 } }, [
          txt({}, ['hello']),
        ]),
      );
      await flushAngular();

      expect(fabric.commits).toBe(commitsBefore);
      expect(createdCount()).toBe(createdBefore);
    });

    it('patches same type/key descriptors without recreating the Fabric node', async () => {
      mountHost(DescriptorOutletHost);
      await flushAngular();

      const before = currentOutletChild();
      const createdBefore = createdCount();

      // why: this is the entire point of DescriptorOutlet over a naive clear-and-rebuild —
      // Fabric's clone-on-write model wants the SAME retained node updated in place, not a
      // fresh `createNode` per re-render.
      capturedHost?.node.set(
        el('view', { testID: 'root', style: { width: 20 } }, [
          txt({}, ['hello']),
        ]),
      );
      await flushAngular();

      const after = currentOutletChild();
      expect(createdCount()).toBe(createdBefore);
      expect(after.instanceHandle).toBe(before.instanceHandle);
      expect(payloadOf(after.handle).width).toBe(20);
    });

    it('clears a prop that is no longer supplied, instead of leaving the stale value behind', async () => {
      mountHost(DescriptorOutletHost);
      await flushAngular();

      // why: patchProps's removed-key branch (`setProperty(key, undefined)`) is the only thing
      // that stops a prop from "sticking" once a render fn stops supplying it — e.g. a style
      // key that only applies conditionally. Every other test in this file only ever CHANGES or
      // KEEPS existing prop keys, so this branch had zero coverage before.
      capturedHost?.node.set(
        el('view', { testID: 'root' }, [txt({}, ['hello'])]),
      );
      await flushAngular();

      const root = currentOutletChild();
      // The recording host applies `OP_SET_PROP`'s removed-key branch by deleting the key
      // outright (`delete node.props[key]`, mirroring the real op stream's own semantics) —
      // absent, not a literal `null` the way the retired mirror modeled it.
      expect(payloadOf(root.handle).width).toBeUndefined();
      expect(root.props.testID).toBe('root');
    });

    it('propagates a text value change to the already-rendered text node', async () => {
      mountHost(DescriptorOutletHost);
      await flushAngular();

      // why: patchChild's string-vs-string branch (`setValue` on the existing text node) is
      // what makes text content reactive at all — every other test in this file leaves the
      // child string "hello" untouched across renders, changing only the PARENT's props.
      capturedHost?.node.set(
        el('view', { testID: 'root', style: { width: 10 } }, [
          txt({}, ['goodbye']),
        ]),
      );
      await flushAngular();

      expect(liveSurface?.children && serialize(liveSurface.children)).toBe(
        'RCTView(RCTText(RCTRawText "goodbye"))',
      );
    });

    it('adds a new child without touching the ones that already existed', async () => {
      mountHost(DescriptorOutletHost);
      await flushAngular();

      const before = currentOutletChild();
      const firstChildBefore = fabric.childrenOf(before.handle)[0];

      // why: patchChildren's append branch (index range beyond the previously-rendered common
      // length) must create ONLY the new child — a bug here (e.g. falling back to
      // clear-and-rebuild) would recreate the first child too, losing its retained identity.
      capturedHost?.node.set(
        el('view', { testID: 'root', style: { width: 10 } }, [
          txt({}, ['hello']),
          txt({}, ['world']),
        ]),
      );
      await flushAngular();

      const root = currentOutletChild();
      expect(serialize([root.handle])).toBe(
        'RCTView(RCTText(RCTRawText "hello")RCTText(RCTRawText "world"))',
      );
      expect(fabric.childrenOf(root.handle)[0]).toBe(firstChildBefore);
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
          el('view', { testID: 'root' }, [
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

      mountHost(TwoChildHost);
      await flushAngular();
      const rootBefore = currentOutletChild();
      const survivingChildBefore = fabric.childrenOf(rootBefore.handle)[0];

      // why: patchChildren's remove branch (rendered children beyond the new, shorter list)
      // must `removeChild` exactly the trailing ones — the surviving first child keeps its
      // Fabric identity, it is not cleared and recreated as a side effect of the shrink.
      capturedTwoChildHost?.node.set(
        el('view', { testID: 'root' }, [txt({}, ['hello'])]),
      );
      await flushAngular();

      const root = currentOutletChild();
      expect(serialize([root.handle])).toBe(
        'RCTView(RCTText(RCTRawText "hello"))',
      );
      expect(fabric.childrenOf(root.handle)[0]).toBe(survivingChildBefore);
    });

    it('replaces the node, losing retained identity, when type or key no longer matches', async () => {
      mountHost(DescriptorOutletHost);
      await flushAngular();

      const before = currentOutletChild();
      const createdBefore = createdCount();

      // why: `sameElement` gates patch-in-place vs replace specifically on `(type, key)` — a
      // root descriptor switching to a DIFFERENT host type is not a prop change to reconcile in
      // place, it is a genuinely different element, so it must go through createElement +
      // replaceChild and get a fresh Fabric identity. This is the branch `sameElement` exists
      // to protect and the original file never exercised it.
      capturedHost?.node.set(el('text', { testID: 'root' }, ['replaced']));
      await flushAngular();

      const after = currentOutletChild();
      expect(createdCount()).toBeGreaterThan(createdBefore);
      expect(after.instanceHandle).not.toBe(before.instanceHandle);
      expect(serialize([after.handle])).toBe('RCTText(RCTRawText "replaced")');
    });

    it('removes its rendered node from a still-mounted parent once destroyed', async () => {
      @Component({
        selector: 'symbiote-descriptor-outlet-host-conditional',
        standalone: true,
        imports: [ViewHost, DescriptorOutlet],
        template: `
          <view testID="parent">
            @if (visible()) {
              <symbiote-descriptor-outlet [node]="node()" />
            }
          </view>
        `,
      })
      class ConditionalHost {
        readonly visible = signal(true);
        readonly node = signal<IDescriptor>(
          el('view', { testID: 'child' }, []),
        );

        constructor() {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          capturedConditionalHost = this;
        }
      }
      let capturedConditionalHost: ConditionalHost | undefined;

      const surface = mountHost(ConditionalHost);
      await flushAngular();
      const parentHandle = surface.children[0];
      if (parentHandle === undefined)
        throw new Error('parent View did not render');
      expect(unwrapAnchors(fabric.childrenOf(parentHandle))).toHaveLength(1);

      // why: ngOnDestroy must detach the node it created from the OUTLET's own host — the
      // product scenario this defends against is a conditionally-mounted DescriptorOutlet
      // (`@if`) toggling off while the REST of the app stays mounted; a missed removeChild
      // would leak the native view behind, still visually present, even though the caller
      // believes it is gone. `afterEach(() => unmount(ROOT_TAG))` alone (the original file's
      // only cleanup) never proves this — it tears down the whole surface, which doesn't
      // exercise this component's OWN destroy path in isolation.
      capturedConditionalHost?.visible.set(false);
      await flushAngular();

      expect(unwrapAnchors(fabric.childrenOf(parentHandle))).toHaveLength(0);
    });
  });
});
