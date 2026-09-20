// The FIFTH adapter, and the last one without a route here.
//
// Angular is the hardest of the five for a reason this file has to work around rather than solve:
// on a device its templates are compiled AHEAD of time (ngtsc partial + the linker in Metro). In a
// test they are compiled at runtime by `@angular/compiler`, which is what the `import` below pulls
// in, and that is the same deal every Angular suite in this repo already makes.
//
// `Component({...})(Klass)` rather than a decorator, copied from `diagnostics.test.ts`: applying the
// decorator as a plain call needs no decorator transform in the bundler at all, and expresses
// exactly the same thing.
//
// Zoneless is not optional — zone.js fights Hermes and the adapter requires
// `provideZonelessChangeDetection`, so a change is observed after an explicit turn rather than
// whenever a zone decides.

import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component, signal } from '@angular/core';
import { mount, unmount } from '@symbiote-native/angular';

import {
  committedShape,
  describe,
  expect,
  findCommitted,
  flushTimers,
  it,
  report,
} from './harness';

const ROOT_TAG = 1;

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

let host: ProbeApp | undefined;

class ProbeApp {
  readonly label = signal('first');
  readonly isExpanded = signal(false);

  constructor() {
    // Captures the live instance so a test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}

Component({
  selector: 'symbiote-angular-probe',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <view [testID]="label()">
      <view testID="always"></view>
      @if (isExpanded()) {
        <view testID="sometimes"></view>
      }
    </view>
  `,
})(ProbeApp);

function probe(): ProbeApp {
  if (host === undefined) throw new Error('the probe was never constructed');
  return host;
}

describe('the Angular adapter on the real engine', () => {
  // why: the smallest proof that a JIT-compiled Angular template reaches Fabric, asserted on the
  // tree React Native committed rather than on what Renderer2 was asked to do.
  it('renders a template into the committed tree', async () => {
    const surface = mount(ROOT_TAG, ProbeApp);
    await tick();
    surface.commit();

    expect(committedShape()).toBe('RootView(View(View(View())))');
    unmount(ROOT_TAG);
  });

  // why: a binding, which is the seam Renderer2 exists for — the value has to travel the adapter's
  // own `setProperty` into a prop Fabric parsed.
  it('binds a signal onto a committed prop', async () => {
    const surface = mount(ROOT_TAG, ProbeApp);
    await tick();
    surface.commit();

    expect(findCommitted(one => one.props.testID === 'first')).toBeDefined();
    unmount(ROOT_TAG);
  });

  // why: the shape every adapter test has — change state, let the framework settle, read the
  // committed tree. Zoneless, so the turn is explicit.
  it('re-renders on a signal change', async () => {
    const surface = mount(ROOT_TAG, ProbeApp);
    await tick();
    surface.commit();
    expect(committedShape()).toBe('RootView(View(View(View())))');

    probe().isExpanded.set(true);
    await tick();
    surface.commit();

    expect(committedShape()).toBe('RootView(View(View(View()View())))');
    unmount(ROOT_TAG);
  });
});

report();
