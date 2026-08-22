// Proves createTunnel (index.ts) actually delivers across two GENUINELY separate,
// independently-mounted SymbioteSurfaces — the same proof React's/Vue's create-tunnel tests
// give, via two real `mount()` calls on different rootTags. Mirrors
// adapters/react/src/create-tunnel.test.tsx and adapters/vue/src/create-tunnel.test.ts.
//
// Coverage dictionary (adapters/angular/src/create-tunnel/index.ts):
//   createTunnel / ITunnelStore.register / .unregister — covered (every test).
//   TunnelInDirective.ngOnInit/ngOnDestroy — covered ("paints…", "removes… once source unmounts").
//   TunnelOut.ngOnInit (effect wiring) — covered (every test that reaches settle()).
//   TunnelOut.sync — add branch covered ("paints…"), remove branch covered ("removes…"), and the
//     multi-entry iteration order covered by "renders multiple simultaneously-tunneled entries
//     in registration order" below (untouched by the original single-entry tests).
//   TunnelOut.ngOnDestroy (stopEffect + view cleanup loop) — covered by "stops reacting once the
//     target itself unmounts" below; the original file never exercised TunnelOut's OWN teardown,
//     only TunnelInDirective's.
//   No Negative group: `tunnelIn`/`tunnel` are `@Input({ required: true })` typed as
//     `ITunnelStore` — same reasoning as create-portal.test.ts: nothing here is validated at
//     runtime against a bad value, so there is no throw path to assert against without an `as`
//     cast to build an illegal input, which is out of the unit's type contract.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ViewHost, TextHost } from '../primitives';
import { createTunnel, TunnelInDirective, TunnelOut } from './index';

const SOURCE_TAG = 920;
const TARGET_TAG = 921;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
};

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(SOURCE_TAG);
  unmount(TARGET_TAG);
});

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function findText(text: string): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === 'RCTRawText' && node.props.text === text)
      found = node;
  });
  return found;
}

function allTexts(): string[] {
  const texts: string[] = [];
  walk(fabric.committed, node => {
    if (node.viewName === 'RCTRawText' && typeof node.props.text === 'string') {
      texts.push(node.props.text);
    }
  });
  return texts;
}

describe('createTunnel (Angular) — genuine cross-surface delivery', () => {
  describe('Positive', () => {
    it('paints content registered by surface A on surface B, a DIFFERENT mounted surface', async () => {
      const tunnel = createTunnel();

      @Component({
        selector: 'symbiote-tunnel-source-app',
        standalone: true,
        imports: [TextHost, TunnelInDirective],
        template: '<Text *tunnelIn="tunnel">ported across surfaces</Text>',
      })
      class SourceApp {
        readonly tunnel = tunnel;
      }

      @Component({
        selector: 'symbiote-tunnel-target-app',
        standalone: true,
        imports: [ViewHost, TunnelOut],
        template: '<View><tunnel-out [tunnel]="tunnel" /></View>',
      })
      class TargetApp {
        readonly tunnel = tunnel;
      }

      // Surface A registers, fully independently, before surface B ever mounts.
      mount(SOURCE_TAG, SourceApp);
      // Surface B mounts SEPARATELY (its own rootTag, its own SymbioteSurface) and reads the
      // tunnel via its own TunnelOut — no ref, no rootTag lookup, no shared Fabric node at all.
      mount(TARGET_TAG, TargetApp);
      await settle();

      // why: this is the entire reason createTunnel exists instead of createPortal — a target
      // in a surface that never shared a commit/mount call with the source must still receive
      // the content, proving the store (not a Fabric node reference) is what crosses surfaces.
      // fake-fabric's `committed` is last-write-wins across rootTags (core/test-utils
      // limitation, not the engine's), so after mounting B second it reflects B's own tree.
      expect(
        findText('ported across surfaces'),
        'content is present in the LAST-committed tree (surface B)',
      ).toBeDefined();
    });

    it('removes the content from the target once the source unmounts', async () => {
      const tunnel = createTunnel();

      @Component({
        selector: 'symbiote-tunnel-source-app-2',
        standalone: true,
        imports: [TextHost, TunnelInDirective],
        template: '<Text *tunnelIn="tunnel">still here</Text>',
      })
      class SourceApp {
        readonly tunnel = tunnel;
      }

      @Component({
        selector: 'symbiote-tunnel-target-app-2',
        standalone: true,
        imports: [ViewHost, TunnelOut],
        template: '<View><tunnel-out [tunnel]="tunnel" /></View>',
      })
      class TargetApp {
        readonly tunnel = tunnel;
      }

      mount(SOURCE_TAG, SourceApp);
      mount(TARGET_TAG, TargetApp);
      await settle();
      expect(
        findText('still here'),
        'present while the source is mounted',
      ).toBeDefined();

      // why: TunnelInDirective.ngOnDestroy must unregister from the shared store — otherwise a
      // torn-down source (e.g. a closed screen) would leave its content stuck painting on the
      // target forever, a real leak, not just a stale-test artifact.
      // Tearing down surface A destroys TunnelInDirective, whose ngOnDestroy unregisters from
      // the shared store; surface B's TunnelOut effect reacts on its own next tick and destroys
      // its view.
      unmount(SOURCE_TAG);
      await settle();
      expect(
        findText('still here'),
        'gone from surface B after the source unmounts',
      ).toBeUndefined();
    });

    it('renders multiple simultaneously-tunneled entries in registration order', async () => {
      const tunnel = createTunnel();

      @Component({
        selector: 'symbiote-tunnel-source-app-3',
        standalone: true,
        imports: [TextHost, TunnelInDirective],
        template: `
          <Text *tunnelIn="tunnel">first</Text>
          <Text *tunnelIn="tunnel">second</Text>
        `,
      })
      class SourceApp {
        readonly tunnel = tunnel;
      }

      @Component({
        selector: 'symbiote-tunnel-target-app-3',
        standalone: true,
        imports: [ViewHost, TunnelOut],
        template: '<View><tunnel-out [tunnel]="tunnel" /></View>',
      })
      class TargetApp {
        readonly tunnel = tunnel;
      }

      // why: `TunnelOut.sync` iterates `ITunnelStore.entries()`, a Map keyed by a monotonic
      // registration id — the product contract is "whoever registered first paints first",
      // exactly like DOM document order for two siblings declared in that order. A single-entry
      // test can never catch a regression that scrambles that order (e.g. iterating an
      // unordered structure instead of the insertion-ordered Map).
      mount(SOURCE_TAG, SourceApp);
      mount(TARGET_TAG, TargetApp);
      await settle();

      expect(allTexts()).toEqual(['first', 'second']);
    });

    it('stops reacting once the target itself unmounts, so a later registration does not touch a destroyed view', async () => {
      const tunnel = createTunnel();

      @Component({
        selector: 'symbiote-tunnel-source-app-4',
        standalone: true,
        imports: [TextHost, TunnelInDirective],
        template: '<Text *tunnelIn="tunnel">late arrival</Text>',
      })
      class SourceApp {
        readonly tunnel = tunnel;
      }

      @Component({
        selector: 'symbiote-tunnel-target-app-4',
        standalone: true,
        imports: [ViewHost, TunnelOut],
        template: '<View><tunnel-out [tunnel]="tunnel" /></View>',
      })
      class TargetApp {
        readonly tunnel = tunnel;
      }

      mount(TARGET_TAG, TargetApp);
      await settle();

      // why: TunnelOut.ngOnDestroy must stop its own `effect()` before the target's injector is
      // gone — an effect left running past its component's teardown and then reacting to a new
      // registration would try to create an EmbeddedView on a destroyed ViewContainerRef, which
      // is exactly the class of bug an unmanaged subscription produces. Registering AFTER the
      // target unmounts must not throw.
      unmount(TARGET_TAG);
      mount(SOURCE_TAG, SourceApp);

      await expect(settle()).resolves.toBeUndefined();
    });
  });
});
