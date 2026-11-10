// Angular half of StatusBar (index.ts), the props stack and native calls are the engine's and
// covered in core/engine/src/status-bar. Here: no Fabric node, a stack entry applied on mount and
// on every input change, released on destroy, and the statics are the engine's own functions
import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as engine from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { StatusBar } from './index';

const ROOT_TAG = 901;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
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

// Stands in for the engine's stack entry, which is what the component's lifecycle drives
function fakeEntry() {
  const apply = vi.fn();
  const release = vi.fn();
  vi.spyOn(engine, 'createStatusBarEntry').mockReturnValue({ apply, release });
  return { apply, release };
}

beforeEach(() => fabric.reset());
afterEach(() => {
  vi.restoreAllMocks();
  unmount(ROOT_TAG);
});

describe('StatusBar', () => {
  // why: StatusBar's template is '' — it drives a native module imperatively and must never paint
  // a real view, or it would silently occupy space / intercept layout in the host tree.
  it('applies status bar props on mount and renders no Fabric node', async () => {
    const { apply } = fakeEntry();

    mount(ROOT_TAG, StatusBarHost);
    await tick();

    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        barStyle: 'dark-content',
        hidden: true,
        animated: false,
      }),
    );

    const root = live.nodeOf(live.appRoot());
    expect(root.children).toHaveLength(0);
  });

  // A prop that changes on a later render (a screen toggling dark mode) must reach native again
  it('re-applies props on every subsequent input change, not only at mount', async () => {
    const { apply } = fakeEntry();
    DynamicStatusBarHost.hidden.set(false);

    mount(ROOT_TAG, DynamicStatusBarHost);
    await tick();
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({ hidden: false }),
    );
    const callsAfterMount = apply.mock.calls.length;

    DynamicStatusBarHost.hidden.set(true);
    await tick();

    // The zoneless scheduler may run more than one pass per commit, so the contract is "at least
    // one more application carrying the new value"
    expect(apply.mock.calls.length).toBeGreaterThan(callsAfterMount);
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({ hidden: true }),
    );
  });

  it('releases its stack entry when the component is destroyed', async () => {
    const { release } = fakeEntry();

    mount(ROOT_TAG, StatusBarHost);
    await tick();
    expect(release).not.toHaveBeenCalled();

    unmount(ROOT_TAG);
    await tick();

    expect(release).toHaveBeenCalledOnce();
  });

  // The statics must be the engine's own functions, a `typeof` check would pass a diverging copy
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

  // A live getter reads through the engine accessor on every access, a snapshot would go stale
  it('exposes currentHeight as a getter backed by the engine platform accessor', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      StatusBar,
      'currentHeight',
    );
    expect(descriptor?.get).toBe(engine.statusBarCurrentHeight);
  });
});
