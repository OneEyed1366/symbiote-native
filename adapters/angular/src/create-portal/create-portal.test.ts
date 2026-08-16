// Proves createPortal (index.ts) paints content into an already-mounted destination WITHIN THE
// SAME SURFACE — mirrors adapters/react/src/create-portal.test.tsx's "same surface, already-mounted
// target" case (Angular has no cross-surface equivalent of this primitive; createTunnel covers
// that, see create-tunnel.test.ts).
//
// Coverage dictionary (adapters/angular/src/create-portal/index.ts):
//   PortalOutletDirective.viewContainerRef — covered indirectly: every test exercises it as the
//     `createEmbeddedView` target; there is no branch inside it worth isolating (a bare `inject()`).
//   PortalDirective.ngOnChanges — covered: first-change view creation ("paints…"), and the
//     destroy-before-recreate branch ("retargets…").
//   PortalDirective.ngOnDestroy — covered: "removes… once toggled off" (via `@if` unmount) and
//     the afterEach `unmount(ROOT_TAG)` teardown implicit in every test.
//   No Negative group: the file header's own comment explains why — `portal`'s type is
//     `PortalOutletDirective`, constructible only by Angular's template compiler resolving a
//     template reference variable, so `strictTemplates` rejects a wrong value at COMPILE time.
//     There is no runtime guard in this unit to exercise with a bad input (unlike React/Vue's
//     `isSymbioteNode` runtime check), and forcing one here would need an `as` cast to build an
//     illegal `portal` value — out of the unit's type contract, so it is skipped, not silenced.

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ViewHost, TextHost } from '../primitives';
import { PortalDirective, PortalOutletDirective } from './index';

const ROOT_TAG = 930;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
};

let capturedHost: HostApp | undefined;

@Component({
  selector: 'symbiote-portal-host-app',
  standalone: true,
  imports: [ViewHost, TextHost, PortalDirective, PortalOutletDirective],
  template: `
    <View>
      <View portalOutlet #overlayHostA="portalOutlet" testID="overlay-host-a"></View>
      <View portalOutlet #overlayHostB="portalOutlet" testID="overlay-host-b"></View>
      @if (visible()) {
        <View *portal="useFirstOutlet() ? overlayHostA : overlayHostB"
          ><Text>portaled content</Text></View
        >
      }
    </View>
  `,
})
class HostApp {
  readonly visible = signal(false);
  readonly useFirstOutlet = signal(true);

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

// `ViewContainerRef.createEmbeddedView` inserts the new view's root node as a SIBLING right
// after its anchor (attribute-directive form: right after the host element it's declared on),
// not as a nested child of that host — confirmed empirically against the fake-Fabric tree before
// writing these assertions, matching real Angular's ViewContainerRef semantics. So "delivered to
// outlet X" is provable as "sits immediately after X in X's own parent's children", not as
// "nested inside X".

function containsText(node: IFakeNode, text: string): boolean {
  if (node.viewName === 'RCTRawText' && node.props.text === text) return true;
  return node.children.some(child => containsText(child, text));
}

function findWithSiblings(
  predicate: (node: IFakeNode) => boolean,
): { siblings: IFakeNode[]; index: number } | undefined {
  let result: { siblings: IFakeNode[]; index: number } | undefined;
  const walk = (nodes: IFakeNode[]): void => {
    nodes.forEach((node, index) => {
      if (predicate(node)) result = { siblings: nodes, index };
      walk(node.children);
    });
  };
  walk(fabric.committed);
  return result;
}

function outletPosition(testId: string): number | undefined {
  return findWithSiblings(node => node.props.testID === testId)?.index;
}

// Matches the plain wrapper View authored by `<View *portal="…">` — deepest RCTView containing
// the text and carrying none of the outlet testIDs, so ancestor Views along the way don't
// shadow it (DFS visits the deepest match last and it wins).
function portaledContentPosition(): number | undefined {
  return findWithSiblings(
    node =>
      node.viewName === 'RCTView' && !node.props.testID && containsText(node, 'portaled content'),
  )?.index;
}

describe('createPortal (Angular) — same-surface delivery', () => {
  describe('Positive', () => {
    it('renders nothing until the portal is toggled on', async () => {
      mount(ROOT_TAG, HostApp);
      await settle();

      // why: `*portal` composes with `@if` exactly like `*ngIf` — no content exists anywhere
      // in the tree before the caller opts in, matching the "closed by default" contract every
      // other same-surface overlay (Modal, toast demos) follows.
      expect(portaledContentPosition()).toBeUndefined();
    });

    it('delivers the content immediately after the target outlet, not the call site', async () => {
      mount(ROOT_TAG, HostApp);
      await settle();
      if (!capturedHost) throw new Error('host was not captured');

      capturedHost.visible.set(true);
      await settle();

      // why: the whole point of a portal is re-parenting into the target's own position in the
      // tree — a bug that just left the content painting at its authored template position
      // (skipping PortalOutletDirective's ViewContainerRef entirely, i.e. `*portal` degrading
      // to a plain `*ngIf`) would still make a "does this text exist somewhere" assertion pass,
      // so the test proves delivery by exact position: the content must land immediately after
      // outlet A, not merely coexist with it in the tree.
      const outletAIndex = outletPosition('overlay-host-a');
      expect(outletAIndex).toBeDefined();
      expect(portaledContentPosition()).toBe((outletAIndex ?? -2) + 1);
    });

    it('removes the portaled content once toggled off', async () => {
      mount(ROOT_TAG, HostApp);
      await settle();
      if (!capturedHost) throw new Error('host was not captured');

      capturedHost.visible.set(true);
      await settle();
      capturedHost.visible.set(false);
      await settle();

      // why: ngOnDestroy must tear down the EmbeddedView it created in the outlet — leaving it
      // behind would leak a native node the caller believes is gone.
      expect(portaledContentPosition()).toBeUndefined();
    });

    it('retargets to the new outlet, without leaving a stale copy at the old one', async () => {
      mount(ROOT_TAG, HostApp);
      await settle();
      if (!capturedHost) throw new Error('host was not captured');

      capturedHost.visible.set(true);
      await settle();
      capturedHost.useFirstOutlet.set(false);
      await settle();

      // why: ngOnChanges explicitly destroys the previous EmbeddedView before creating the new
      // one at the new `portal` input value — this is the destroy-before-recreate branch of the
      // unit that the "toggled on"/"toggled off" tests above never exercise, since they only
      // ever create the view once. A regression here (e.g. creating before destroying, or not
      // destroying at all) would leave the content rendered at BOTH outlets at once, or the old
      // copy would linger even though the caller asked to move it.
      const outletBIndex = outletPosition('overlay-host-b');
      expect(outletBIndex).toBeDefined();
      expect(portaledContentPosition()).toBe((outletBIndex ?? -2) + 1);
    });
  });
});
