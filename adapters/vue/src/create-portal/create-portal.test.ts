// Proves the adapter's portal — Vue's own <Teleport> over this renderer (create-portal/index.ts).
// Every assertion reads the COMMITTED Fabric tree (`fabric.committed`), never `fabric.find`: a
// portal relocates nodes, so the parent that matters is the one the last commit published, and a
// created node's props/children are frozen at its first createNode.
//
// Parentage is asserted BOTH ways throughout — content is under the target AND is not under the
// call site — because "it appeared somewhere" is exactly the false green a portal test invites.
//
// Each case mounts on its OWN rootTag with its own refs. A shared tag would let one case's surface
// linger into the next and satisfy an assertion the case under test never earned.

import {
  defineComponent,
  h,
  inject,
  provide,
  ref,
  shallowRef,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import {
  isSymbioteNode,
  type ISymbioteNode,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import { Teleport } from './index';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const FIRST_ROOT_TAG = 700;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let previousRootTag = FIRST_ROOT_TAG;
let rootTag = FIRST_ROOT_TAG;
beforeEach(() => {
  fabric.reset();
  rootTag = ++previousRootTag;
});
afterEach(() => unmount(rootTag));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function findByTestId(testId: string): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.props.testID === testId) found = node;
  });
  return found;
}

/** Asserting-and-narrowing lookup: a missing node is the failure, not a later `undefined` deref. */
function committed(testId: string): IFakeNode {
  const node = findByTestId(testId);
  expect(node, `"${testId}" is in the committed tree`).toBeDefined();
  if (node === undefined) throw new Error('unreachable');
  return node;
}

function isDescendantOf(root: IFakeNode, target: IFakeNode): boolean {
  if (root === target) return true;
  return root.children.some(child => isDescendantOf(child, target));
}

function childTestIds(node: IFakeNode): unknown[] {
  return node.children.map(child => child.props.testID);
}

describe('Teleport — the Vue adapter portal', () => {
  describe('Positive', () => {
    // why: the whole point of a portal — the content leaves the subtree it was WRITTEN in and lands
    // under a node it only holds a ref to. The negative half of the assertion is what makes this a
    // portal test rather than a "did anything render" test.
    //
    // The third assertion pins the placement precisely: the content is a DIRECT child of the target,
    // interleaved with the target's own children, with no wrapper node between them. Teleport marks
    // its landing zone with two empty text nodes, which this renderer maps to engine anchors, and
    // the commit walk drops anchors entirely (renderableChildren, core/engine/src/commit.ts) — so
    // unlike a DOM portal's container element, nothing extra reaches Fabric.
    it('lands the content under the target as a direct child, out of its own template parent', async () => {
      const overlayRef = shallowRef<ISymbioteNode | null>(null);
      mount(
        rootTag,
        defineComponent({
          setup: () => () =>
            h('symbiote-view', {}, [
              h('symbiote-view', { ref: overlayRef, testID: 'overlay-host' }, [
                h('symbiote-view', { testID: 'own-child' }),
              ]),
              h('symbiote-view', { testID: 'source' }, [
                overlayRef.value
                  ? h(Teleport, { to: overlayRef.value }, () =>
                      h('symbiote-view', { testID: 'ported' }),
                    )
                  : null,
              ]),
            ]),
        }),
      );
      await tick();

      const overlayHost = committed('overlay-host');
      const source = committed('source');
      const ported = committed('ported');

      expect(
        isDescendantOf(overlayHost, ported),
        'the content landed under the target',
      ).toBe(true);
      expect(
        isDescendantOf(source, ported),
        'and left the template parent it was written in',
      ).toBe(false);
      expect(
        childTestIds(overlayHost),
        'direct child of the target, after the target’s own children, no wrapper',
      ).toEqual(['own-child', 'ported']);
    });

    // why: React's createPortal accepts `ISymbioteNode | SymbioteSurface`, so a target of "the
    // surface root itself" is part of the capability being matched — it is how content escapes to
    // the very top of the tree when no overlay host node exists to aim at. The renderer's own
    // insert/remove already branch on a surface parent; this proves Teleport reaches that branch.
    it('accepts the surface root itself as the target', async () => {
      const surfaceRef = shallowRef<SymbioteSurface | null>(null);
      const surface = mount(
        rootTag,
        defineComponent({
          setup: () => () =>
            h('symbiote-view', { testID: 'source' }, [
              surfaceRef.value
                ? h(Teleport, { to: surfaceRef.value }, () =>
                    h('symbiote-view', { testID: 'ported' }),
                  )
                : null,
            ]),
        }),
      );
      surfaceRef.value = surface;
      await tick();

      const ported = committed('ported');
      expect(
        isDescendantOf(committed('source'), ported),
        'the content left the source subtree for the surface root',
      ).toBe(false);
      expect(
        childTestIds(fabric.appRoot()),
        'both the source and the portaled content are top-level siblings',
      ).toEqual(['source', 'ported']);
    });

    // why: a portal that painted once and then froze would pass every placement assertion above.
    // The reactive dependency is read INSIDE the teleported slot and owned by the component that
    // wrote it — not by a child component with its own update machinery, which would satisfy this
    // through its own re-render and prove nothing about the relocated content.
    it('keeps applying reactive updates to content that has already moved', async () => {
      const overlayRef = shallowRef<ISymbioteNode | null>(null);
      const label = ref('before');
      mount(
        rootTag,
        defineComponent({
          setup: () => () =>
            h('symbiote-view', {}, [
              h('symbiote-view', { ref: overlayRef, testID: 'overlay-host' }),
              overlayRef.value
                ? h(Teleport, { to: overlayRef.value }, () =>
                    h('symbiote-view', {
                      testID: 'ported',
                      accessibilityLabel: label.value,
                    }),
                  )
                : null,
            ]),
        }),
      );
      await tick();
      expect(committed('ported').props.accessibilityLabel).toBe('before');

      label.value = 'after';
      await tick();

      const ported = committed('ported');
      expect(ported.props.accessibilityLabel, 'the update reached it').toBe(
        'after',
      );
      expect(
        isDescendantOf(committed('overlay-host'), ported),
        'and it stayed put',
      ).toBe(true);
    });

    // why: nodes are MOVED, not copied — the row that separates a portal from a tunnel. Asserting
    // only "it is now under B" would pass just as well for a copy, so the load-bearing assertion is
    // that A is left EMPTY.
    it('moves the content when the target changes, emptying the old target', async () => {
      const hostARef = shallowRef<ISymbioteNode | null>(null);
      const hostBRef = shallowRef<ISymbioteNode | null>(null);
      const targetIsB = ref(false);
      mount(
        rootTag,
        defineComponent({
          setup: () => () =>
            h('symbiote-view', {}, [
              h('symbiote-view', { ref: hostARef, testID: 'host-a' }),
              h('symbiote-view', { ref: hostBRef, testID: 'host-b' }),
              hostARef.value && hostBRef.value
                ? h(
                    Teleport,
                    { to: targetIsB.value ? hostBRef.value : hostARef.value },
                    () => h('symbiote-view', { testID: 'ported' }),
                  )
                : null,
            ]),
        }),
      );
      await tick();
      expect(childTestIds(committed('host-a')), 'it starts in host A').toEqual([
        'ported',
      ]);

      targetIsB.value = true;
      await tick();

      expect(childTestIds(committed('host-b')), 'it moved to host B').toEqual([
        'ported',
      ]);
      expect(
        committed('host-a').children,
        'and host A was emptied — the node moved, it was not copied',
      ).toHaveLength(0);
    });

    // why: the teleported nodes live under a parent the portal's own vnode no longer owns, so
    // nothing about the call site's removal automatically reaches them — Teleport has to unmount
    // them through its own `remove`. A leak here is invisible in the source subtree and only shows
    // up as a stale overlay on screen.
    it('detaches the content from the target when the portal unmounts', async () => {
      const overlayRef = shallowRef<ISymbioteNode | null>(null);
      const isShown = ref(true);
      mount(
        rootTag,
        defineComponent({
          setup: () => () =>
            h('symbiote-view', {}, [
              h('symbiote-view', { ref: overlayRef, testID: 'overlay-host' }),
              overlayRef.value && isShown.value
                ? h(Teleport, { to: overlayRef.value }, () =>
                    h('symbiote-view', { testID: 'ported' }),
                  )
                : null,
            ]),
        }),
      );
      await tick();
      expect(childTestIds(committed('overlay-host'))).toEqual(['ported']);

      isShown.value = false;
      await tick();

      expect(
        findByTestId('ported'),
        'the content is gone from the committed tree',
      ).toBeUndefined();
      expect(
        committed('overlay-host').children,
        'and the target is empty again',
      ).toHaveLength(0);
    });

    // why: `disabled` is a documented Vue Teleport option this wrapper passes straight through
    // (setup only validates `to`). Without a test, a regression would silently ship broken in-place
    // rendering even though the wrapper's own reason to exist is validating `to`, not `disabled`.
    it('keeps the content in its template position when disabled', async () => {
      const overlayRef = shallowRef<ISymbioteNode | null>(null);
      mount(
        rootTag,
        defineComponent({
          setup: () => () =>
            h('symbiote-view', {}, [
              h('symbiote-view', { ref: overlayRef, testID: 'overlay-host' }),
              h('symbiote-view', { testID: 'source' }, [
                overlayRef.value
                  ? h(Teleport, { to: overlayRef.value, disabled: true }, () =>
                      h('symbiote-view', { testID: 'ported' }),
                    )
                  : null,
              ]),
            ]),
        }),
      );
      await tick();

      const ported = committed('ported');
      expect(
        isDescendantOf(committed('source'), ported),
        'it stayed where it was written',
      ).toBe(true);
      expect(
        isDescendantOf(committed('overlay-host'), ported),
        'and never reached the target',
      ).toBe(false);
    });

    // why: this is the capability a tunnel structurally cannot reproduce, and the reason the two
    // are not interchangeable. Teleport keeps the content's VNODE in the call site's component
    // tree and relocates only host nodes, so inject resolves from where the content was WRITTEN.
    // The overlay host below sits outside the provider on purpose: through a tunnel the same
    // content resolves against the Out site and reads the other value — pinned as the matched
    // opposite in ../create-tunnel/create-tunnel.test.ts.
    it('preserves call-site provide/inject, resolving from where the content was written', async () => {
      const overlayRef = shallowRef<ISymbioteNode | null>(null);
      const ORIGIN_KEY = 'portal-origin';

      const Consumer = defineComponent({
        setup: () => {
          const origin = inject(ORIGIN_KEY, 'default');
          return () =>
            h('symbiote-view', {
              testID: 'ported',
              accessibilityLabel: origin,
            });
        },
      });
      const Provider = defineComponent({
        setup: (_props, { slots }) => {
          provide(ORIGIN_KEY, 'call site');
          return () => slots.default?.();
        },
      });

      mount(
        rootTag,
        defineComponent({
          setup: () => () =>
            h('symbiote-view', {}, [
              h(Provider, null, {
                default: () =>
                  overlayRef.value
                    ? h(Teleport, { to: overlayRef.value }, () => h(Consumer))
                    : null,
              }),
              h('symbiote-view', { ref: overlayRef, testID: 'overlay-host' }),
            ]),
        }),
      );
      await tick();

      const ported = committed('ported');
      expect(
        ported.props.accessibilityLabel,
        'inject resolved at the call site, inside the provider',
      ).toBe('call site');
      expect(
        isDescendantOf(committed('overlay-host'), ported),
        'even though the node itself landed outside the provider',
      ).toBe(true);
    });
  });

  // The guard's error no longer escapes `mount()`. render.ts sets `app.config.errorHandler`, so
  // Vue hands an unclaimed error to the engine's host reporter — the native redbox — instead of
  // re-throwing out of `app.mount()` and aborting the surface bring-up. The property under test is
  // unchanged (an invalid target fails LOUDLY rather than painting nothing); only the channel it
  // fails through moved, and in a release bundle that channel is the one that actually reaches
  // anybody. See the seam comment in render.ts.
  describe('Negative — an invalid target is reported immediately, not silently no-oped', () => {
    function reportedBy(mountInvalid: () => void): string[] {
      const reportError = vi.fn();
      Object.assign(globalThis, { ErrorUtils: { reportError } });
      try {
        mountInvalid();
      } finally {
        Reflect.deleteProperty(globalThis, 'ErrorUtils');
      }
      return reportError.mock.calls.map(call => String(call[0]));
    }

    // why: renderer.ts stubs querySelector to null (no DOM), so a DOM-world CSS-selector string
    // must fail loudly at the Teleport boundary. Vue's own handling is a dev-only warn plus a null
    // target, which paints nothing and gives no clue at the call site.
    it('reports a CSS-selector string target instead of silently no-oping', () => {
      const reported = reportedBy(() =>
        mount(
          rootTag,
          defineComponent({
            setup: () => () =>
              h(Teleport, { to: 'body' }, () => h('symbiote-view')),
          }),
        ),
      );

      expect(
        reported.some(message => /CSS-selector string/.test(message)),
      ).toBe(true);
    });

    // why: `to` is typed `null` (no compile-time check) so a wrong runtime value — a plain object,
    // a forgotten `.value` on a ref — must be caught by this component's own guard before it
    // reaches the real Teleport and corrupts the retained tree. JSON.parse is how this repo
    // produces an untyped value without an `as` cast.
    it('rejects a target that is not a real host node', () => {
      const garbage = JSON.parse('{}');
      expect(isSymbioteNode(garbage)).toBe(false);

      const reported = reportedBy(() =>
        mount(
          rootTag,
          defineComponent({
            setup: () => () =>
              h(Teleport, { to: garbage }, () => h('symbiote-view')),
          }),
        ),
      );

      expect(
        reported.some(message => /not a real host node/.test(message)),
      ).toBe(true);
    });
  });
});
