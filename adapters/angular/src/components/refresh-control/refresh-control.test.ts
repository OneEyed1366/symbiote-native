// RefreshControl forwards every native prop straight through (no shared render fn — see
// index.ts's header comment) and its controlled-value handshake is written once in this file's
// class, not in @symbiote-native/components, so it IS the unit under test here (not shared,
// nothing to defer to core). `refreshing` is a controlled prop: native starts the spinner before
// JS runs, so handleRefresh must force it back to the JS value if the caller's onRefresh doesn't
// flip `refreshing` itself — the same controlled-native-spinner contract
// scroll-view-projection.test.ts's "renders iOS RefreshControl before content and syncs the
// controlled native spinner" case exercises through a ScrollView composition; this file proves
// it in isolation. Also covers the anchor `class=` resolution (mirrors pressable.test.ts's
// "resolves a class=" case).
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
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
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
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
    registerStyles({ spinner: { backgroundColor: 'green' } });

    mount(ROOT_TAG, RefreshControlHostFixture);
    await tick();

    const node = fabric.find(n => n.props.testID === 'refresh');
    expect(node?.props.backgroundColor).toBe('green');
  });
});
