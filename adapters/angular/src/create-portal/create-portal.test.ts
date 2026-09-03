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
//   PortalOutletDirective's placement guard — covered by the Negative group: the marker on a real
//     element throws. `portal`'s VALUE still needs no runtime check (its type is
//     `PortalOutletDirective`, constructible only by the template compiler, so `strictTemplates`
//     rejects a wrong value at compile time); what cannot be typed is WHERE the marker sits.

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ViewHost, TextHost } from '../primitives';
import { PortalDirective, PortalOutletDirective } from './index';

const ROOT_TAG = 930;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
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
      <View testID="overlay-host-a">
        <ng-container portalOutlet #overlayHostA="portalOutlet"></ng-container>
      </View>
      <View testID="overlay-host-b">
        <ng-container portalOutlet #overlayHostB="portalOutlet"></ng-container>
      </View>
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

// "Delivered to outlet X" means INSIDE X — React's contract for the same API
// (`isDescendantOf` in adapters/react/src/create-portal/create-portal.test.tsx) and what a layout
// assumes. It holds only because the marker sits on an `<ng-container>` within the host.
//
// This file asserted the SIBLING placement until 2026-09-02, i.e. it pinned the divergence instead
// of catching it.

function containsText(node: IFakeNode, text: string): boolean {
  if (node.viewName === 'RCTRawText' && node.props.text === text) return true;
  return node.children.some(child => containsText(child, text));
}

function findNode(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  let result: IFakeNode | undefined;
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (predicate(node)) result = node;
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return result;
}

function outlet(testId: string): IFakeNode | undefined {
  return findNode(node => node.props.testID === testId);
}

// Strict: a node is not its own descendant, so an assertion cannot pass by finding the host.
function isDescendantOf(root: IFakeNode, target: IFakeNode): boolean {
  return root.children.some(
    child => child === target || isDescendantOf(child, target),
  );
}

// Matches the plain wrapper View authored by `<View *portal="…">` — deepest RCTView containing
// the text and carrying none of the outlet testIDs, so ancestor Views along the way don't
// shadow it (DFS visits the deepest match last and it wins).
function portaledContent(): IFakeNode | undefined {
  return findNode(
    node =>
      node.viewName === 'RCTView' &&
      !node.props.testID &&
      containsText(node, 'portaled content'),
  );
}

// The placement that shipped until 2026-09-02 and that the guard now refuses: the marker on the
// host ELEMENT rather than on an anchor inside it.
@Component({
  selector: 'symbiote-portal-bad-outlet-app',
  standalone: true,
  imports: [ViewHost, PortalOutletDirective],
  template: `<View portalOutlet #bad="portalOutlet" testID="bad-host"></View>`,
})
class BadOutletApp {}

describe('createPortal (Angular) — same-surface delivery', () => {
  describe('Positive', () => {
    it('renders nothing until the portal is toggled on', async () => {
      mount(ROOT_TAG, HostApp);
      await settle();

      // why: `*portal` composes with `@if` exactly like `*ngIf` — no content exists anywhere
      // in the tree before the caller opts in, matching the "closed by default" contract every
      // other same-surface overlay (Modal, toast demos) follows.
      expect(portaledContent()).toBeUndefined();
    });

    it('delivers the content INSIDE the target outlet, not at the call site', async () => {
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
      const hostA = outlet('overlay-host-a');
      const hostB = outlet('overlay-host-b');
      const ported = portaledContent();
      if (hostA === undefined || hostB === undefined || ported === undefined) {
        throw new Error('outlets and portaled content must all be committed');
      }
      expect(isDescendantOf(hostA, ported), 'landed under outlet A').toBe(true);
      // The other outlet pins that "under A" is a real placement rather than "somewhere in the
      // tree" — both hosts are siblings, so a portal that never moved would fail this half.
      expect(isDescendantOf(hostB, ported), 'not under outlet B').toBe(false);
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
      expect(portaledContent()).toBeUndefined();
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
      const hostA = outlet('overlay-host-a');
      const hostB = outlet('overlay-host-b');
      const ported = portaledContent();
      if (hostA === undefined || hostB === undefined || ported === undefined) {
        throw new Error('outlets and portaled content must all be committed');
      }
      expect(isDescendantOf(hostB, ported), 'moved under outlet B').toBe(true);
      expect(isDescendantOf(hostA, ported), 'no stale copy under A').toBe(
        false,
      );
    });
  });

  describe('Negative', () => {
    // why: the wrong placement commits a TREE, silently — the ported content simply appears beside
    // the host instead of in it, so no assertion downstream and nothing on screen says which of the
    // two an app got. It has to fail where it is written.
    it('refuses a marker placed on the host element instead of inside it', () => {
      expect(() => mount(ROOT_TAG, BadOutletApp)).toThrow(
        /portalOutlet must sit on an <ng-container>/,
      );
    });
  });
});
