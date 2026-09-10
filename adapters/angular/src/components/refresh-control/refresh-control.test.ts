// RefreshControl forwards every native prop straight through (no shared render fn — see
// index.ts's header comment). The controlled-value handshake is NO LONGER this class's: it lives
// in `core/components/src/behaviors/refresh-control.ts` and is exercised there. What this file
// still owns is that the wrapper reaches it — the template's `refresh-control` tag is what the
// behavior attaches to, and the @Output() must fire from inside the behavior's own dispatcher.
// `refreshing` is a controlled prop: native starts the spinner before JS runs, so the pull must
// force it back to the JS value if the caller's handler doesn't
// flip `refreshing` itself — the same controlled-native-spinner contract
// scroll-view-projection.test.ts's "renders iOS RefreshControl before content and syncs the
// controlled native spinner" case exercises through a ScrollView composition; this file proves
// it in isolation. Also covers the anchor `class=` resolution (mirrors pressable.test.ts's
// "resolves a class=" case).
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGlobalStyles,
  clearHostBehaviors,
  registerRules,
} from '@symbiote-native/engine';
import { registerRefreshControlBehavior } from '@symbiote-native/components';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { RefreshControl } from './index';

const ROOT_TAG = 914;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: RefreshControlHostFixture | undefined;

@Component({
  selector: 'symbiote-refresh-control-host',
  standalone: true,
  imports: [RefreshControl],
  template: `
    <RefreshControl
      [refreshing]="false"
      [testID]="'refresh'"
      class="spinner"
      (refresh)="onRefresh()"
    ></RefreshControl>
  `,
})
class RefreshControlHostFixture {
  onRefresh = vi.fn();
  constructor() {
    // Captures the live component instance so the test can assert on its spies after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  capturedHost = undefined;
  fabric.reset();
  // `adapters/angular/src/render` does not import `../../register`, so the behavior has to be
  // installed here — the same shape every other behavior-backed Angular test uses.
  registerRefreshControlBehavior();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
  clearHostBehaviors();
});

// why: contract-accurate group name — nothing here throws. A pull gesture always resolves to an
// emitted output + an optional corrective native command, never a rejection.
describe('RefreshControl (no throwing path — see file header)', () => {
  it('fires refresh once per pull gesture and forces the native spinner back down when the caller leaves refreshing=false', async () => {
    mount(ROOT_TAG, RefreshControlHostFixture);
    await tick();

    const node = fabric.find(n => n.props.testID === 'refresh');
    expect(node, 'RefreshControl host committed').toBeDefined();

    fabric.fireEvent(node?.instanceHandle, 'topRefresh');
    await tick();
    await tick();

    expect(capturedHost?.onRefresh).toHaveBeenCalledOnce();
    // why: source contract (index.ts's handleRefresh doc comment) — native already started
    // spinning on the gesture; since the caller's onRefresh never flips [refreshing] to true,
    // the JS side stays authoritative and must dispatch the native command that resets it.
    expect(fabric.commands.at(-1)).toMatchObject({
      commandName: 'setNativeRefreshing',
      args: [false],
    });
    expect(fabric.commands.at(-1)?.node.tag).toBe(node?.tag);
  });

  it('resolves a class= on the RefreshControl use site onto the real committed view, not the anchor', async () => {
    registerRules([
      {
        tokens: ['spinner'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'green' },
      },
    ]);

    mount(ROOT_TAG, RefreshControlHostFixture);
    await tick();

    const node = fabric.find(n => n.props.testID === 'refresh');
    expect(node?.props.backgroundColor).toBe('green');
  });
});
