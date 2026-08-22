// Proves the Angular lifecycle half of StatusBar (index.ts): the native driving, the imperative
// statics, and the Android bar-height accessor all live in @symbiote-native/engine's status-bar
// module (shared verbatim with React/Vue, and covered by that module's own tests — N/A here). What
// is Angular-specific: the declarative component (a) renders NO Fabric node — StatusBar has no
// visual, only a native side effect — (b) re-applies its props through ngOnChanges on mount AND on
// every subsequent input change, not just once, and (c) attaches the SAME engine functions as its
// static methods rather than re-implementing them, so a future engine fix can't silently diverge
// from what the component exposes. No Negative group: ngOnChanges/buildProps is a pure prop fold
// with no throwing branch, and applyStatusBarProps itself already treats a missing native module as
// a silent no-op (an engine-level concern, not asserted again here).
import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as engine from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { StatusBar } from './index';

const ROOT_TAG = 901;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'symbiote-status-bar-host',
  standalone: true,
  imports: [StatusBar],
  template: `
    <StatusBar [barStyle]="'dark-content'" [hidden]="true" [animated]="false" />
  `,
})
class StatusBarHost {}

class DynamicStatusBarHost {
  static readonly hidden = signal(false);
  get hiddenValue(): boolean {
    return DynamicStatusBarHost.hidden();
  }
}
Component({
  selector: 'symbiote-status-bar-dynamic-host',
  standalone: true,
  imports: [StatusBar],
  template: `<StatusBar [hidden]="hiddenValue" [animated]="false" />`,
})(DynamicStatusBarHost);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('StatusBar', () => {
  // why: StatusBar's template is '' — it drives a native module imperatively and must never paint
  // a real view, or it would silently occupy space / intercept layout in the host tree.
  it('applies status bar props on mount and renders no Fabric node', async () => {
    const spy = vi
      .spyOn(engine, 'applyStatusBarProps')
      .mockReturnValue(undefined);

    mount(ROOT_TAG, StatusBarHost);
    await tick();

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        barStyle: 'dark-content',
        hidden: true,
        animated: false,
      }),
    );

    const root = fabric.appRoot();
    expect(root.children).toHaveLength(0);
  });

  // why: the component's own file comment states it "re-applies the props through ngOnChanges on
  // mount + every prop change" — a StatusBar whose `hidden`/`barStyle` prop changes on a later
  // render (e.g. a screen toggling dark mode) must re-drive the native module again, not just once
  // at mount, or the status bar would freeze at its first-render appearance forever.
  it('re-applies props on every subsequent input change, not only at mount', async () => {
    const spy = vi
      .spyOn(engine, 'applyStatusBarProps')
      .mockReturnValue(undefined);
    DynamicStatusBarHost.hidden.set(false);

    mount(ROOT_TAG, DynamicStatusBarHost);
    await tick();
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ hidden: false }),
    );
    const callsAfterMount = spy.mock.calls.length;

    DynamicStatusBarHost.hidden.set(true);
    await tick();

    // Not asserting an exact call count: Angular's zoneless scheduler may run more than one CD
    // pass per commit, which is its own internal detail, not a product contract. The contract is
    // that a LATER input change drives at least one more real re-application with the new value.
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterMount);
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ hidden: true }),
    );
  });

  // why: Object.assign(StatusBarComponent, statusBarImperative) must forward the EXACT engine
  // functions, not wrapped/re-authored stand-ins — a `typeof StatusBar.setHidden === 'function'`
  // check alone would stay green even if the component shipped its own diverging implementation,
  // which is exactly the structural-parity failure <adapters_reach_full_feature_parity> forbids.
  it('exposes the imperative statics as the same functions the engine defines', () => {
    expect(StatusBar.setHidden).toBe(engine.statusBarImperative.setHidden);
    expect(StatusBar.setBarStyle).toBe(engine.statusBarImperative.setBarStyle);
    expect(StatusBar.setNetworkActivityIndicatorVisible).toBe(
      engine.statusBarImperative.setNetworkActivityIndicatorVisible,
    );
    expect(StatusBar.setBackgroundColor).toBe(
      engine.statusBarImperative.setBackgroundColor,
    );
    expect(StatusBar.setTranslucent).toBe(
      engine.statusBarImperative.setTranslucent,
    );
  });

  // why: currentHeight is wired as a live GETTER (Object.defineProperty), not a value snapshotted
  // once at module load — it must read through the engine's own platform accessor every access, so
  // this proves the descriptor is the accessor itself, not merely that a `currentHeight` key exists.
  it('exposes currentHeight as a getter backed by the engine platform accessor', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      StatusBar,
      'currentHeight',
    );
    expect(descriptor?.get).toBe(engine.statusBarCurrentHeight);
  });
});
