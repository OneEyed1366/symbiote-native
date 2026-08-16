import '@angular/compiler';
import { Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Appearance, Dimensions, type IDimensionsSet } from '@symbiote-native/engine';

// `IAppearancePreferences` isn't exported from the engine barrel — derived structurally from
// the real `addChangeListener` signature instead of re-declaring (and risking drifting from)
// its shape locally.
type IAppearanceListener = Parameters<typeof Appearance.addChangeListener>[0];
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ColorSchemeService } from './color-scheme.service';
import { WindowDimensionsService } from './window-dimensions.service';

const ROOT_TAG = 900;
const fabric = installFabric();

let capturedColorSchemeService: ColorSchemeService | undefined;
let capturedWindowDimensionsService: WindowDimensionsService | undefined;

@Component({
  selector: 'symbiote-color-scheme-consumer',
  standalone: true,
  providers: [ColorSchemeService],
  template: '',
})
class ColorSchemeConsumer {
  readonly service = inject(ColorSchemeService);
  constructor() {
    capturedColorSchemeService = this.service;
  }
}

@Component({
  selector: 'symbiote-window-dimensions-consumer',
  standalone: true,
  providers: [WindowDimensionsService],
  template: '',
})
class WindowDimensionsConsumer {
  readonly service = inject(WindowDimensionsService);
  constructor() {
    capturedWindowDimensionsService = this.service;
  }
}

@Component({
  selector: 'symbiote-root-window-dimensions-consumer',
  standalone: true,
  template: '',
})
class RootWindowDimensionsConsumer {
  readonly service = inject(WindowDimensionsService);
  constructor() {
    capturedWindowDimensionsService = this.service;
  }
}

beforeEach(() => {
  capturedColorSchemeService = undefined;
  capturedWindowDimensionsService = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.restoreAllMocks();
});

// Coverage dictionary:
//   ColorSchemeService constructor — initial-value field init: covered. addChangeListener
//     subscribe: covered. listener updates the signal: covered (two transitions). DestroyRef
//     unsubscribe: covered (listener count drops to 0 and a post-unmount event no longer moves
//     the signal — both halves of "actually removed", not just "removal was called").
//   WindowDimensionsService constructor — initial-value field init: covered. addEventListener
//     subscribe: covered. handleChange's equality-guard branch (no-op) and update branch: both
//     covered. The post-subscribe re-check race (constructor's own "close the gap" comment):
//     covered. DestroyRef unsubscribe: covered (`remove` mock called once).
//   Provider scoping — `providedIn: 'root'` resolving with no explicit `providers:` entry:
//     covered by RootWindowDimensionsConsumer specifically to prove it (WindowDimensionsConsumer
//     alone, with an explicit provider, would not distinguish the two).
//
// Both services are the Angular-idiomatic lifecycle bucket (angular-adapter §0 — the DI
// equivalent of React's useColorScheme/useWindowDimensions hooks or Vue's composables): state +
// subscription lifecycle live in an @Injectable, not a function closure, so the product rules
// under test are (1) the Signal tracks the underlying engine module, (2) DestroyRef actually
// unsubscribes on teardown (an Angular service leak has no GC-visible symptom, only a growing
// listener set), and (3) provider scoping (`providedIn: 'root'` vs an explicit `providers:
// [...]`) both resolve to a working instance. Neither service has a throwing path (a
// subscription setup that fails would surface as an engine-level error, not this service's own
// contract) — Positive is the only group.
describe('Angular DI services over engine modules', () => {
  // why: a signal that never updates after Appearance.addChangeListener fires would leave every
  // consuming component permanently stuck on the color scheme it booted with; a listener that
  // outlives the component is a real leak (component gone, callback still firing into a
  // destroyed instance) that DestroyRef.onDestroy must prevent.
  it('ColorSchemeService subscribes to Appearance and cleans up on unmount', async () => {
    const activeListeners = new Set<IAppearanceListener>();
    let emitToListeners: IAppearanceListener = () => {};

    vi.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
    vi.spyOn(Appearance, 'addChangeListener').mockImplementation(listener => {
      activeListeners.add(listener);
      emitToListeners = preferences => {
        for (const l of activeListeners) l(preferences);
      };
      return {
        remove: () => {
          activeListeners.delete(listener);
        },
      };
    });

    mount(ROOT_TAG, ColorSchemeConsumer);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const service = capturedColorSchemeService;
    if (!service) throw new Error('ColorSchemeService was not captured');

    expect(service.colorScheme()).toBe('light');
    expect(Appearance.addChangeListener).toHaveBeenCalledOnce();

    emitToListeners({ colorScheme: 'dark' });
    expect(service.colorScheme()).toBe('dark');

    emitToListeners({ colorScheme: 'light' });
    expect(service.colorScheme()).toBe('light');

    unmount(ROOT_TAG);
    expect(activeListeners.size).toBe(0);

    // After unmount, the signal must stop reacting to further events.
    emitToListeners({ colorScheme: 'dark' });
    expect(service.colorScheme()).toBe('light');
  });

  // why: `providedIn: 'root'` means a component with NO explicit `providers: [...]` entry must
  // still be able to `inject()` the service — RootWindowDimensionsConsumer deliberately omits
  // the providers array (unlike WindowDimensionsConsumer below, which supplies one explicitly)
  // to prove root-scoped DI actually reaches the Symbiote bootstrap's environment injector
  // (angular-adapter §2's createEnvironmentInjector — not a given, since that bootstrap has no
  // platform-browser and builds its own injector tree from scratch).
  it('provides WindowDimensionsService from the Symbiote root injector', async () => {
    const initialMetrics = { width: 100, height: 200, scale: 1, fontScale: 1 };
    vi.spyOn(Dimensions, 'get').mockReturnValue(initialMetrics);
    vi.spyOn(Dimensions, 'addEventListener').mockReturnValue({ remove: vi.fn() });

    mount(ROOT_TAG, RootWindowDimensionsConsumer);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(capturedWindowDimensionsService?.dimensions()).toEqual(initialMetrics);
  });

  // why: the signal setter is guarded by a field-by-field equality check (width/height/scale/
  // fontScale) rather than a plain `.set(window)` on every event — RN fires `change` on ANY
  // Dimensions update including ones that don't affect this window (e.g. a screen-only change),
  // and setting an equal-valued object would still trigger Angular's SignalView dirtying on
  // every consumer for no visible change. Both directions matter: a same-metrics event must
  // preserve signal IDENTITY (no re-render), a different-metrics event must actually update.
  it('WindowDimensionsService subscribes to Dimensions and ignores no-op updates', async () => {
    const remove = vi.fn();
    let capturedListener: ((set: IDimensionsSet) => void) | undefined;

    const initialMetrics = { width: 100, height: 200, scale: 1, fontScale: 1 };
    vi.spyOn(Dimensions, 'get').mockReturnValue(initialMetrics);
    vi.spyOn(Dimensions, 'addEventListener').mockImplementation((_type, listener) => {
      capturedListener = set => listener(set);
      return { remove };
    });

    mount(ROOT_TAG, WindowDimensionsConsumer);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const service = capturedWindowDimensionsService;
    if (!service) throw new Error('WindowDimensionsService was not captured');

    const initial = service.dimensions();
    expect(initial).toEqual(initialMetrics);
    expect(Dimensions.addEventListener).toHaveBeenCalledOnce();

    // Same metrics: signal identity must be preserved (equality guard).
    capturedListener?.({
      window: { width: 100, height: 200, scale: 1, fontScale: 1 },
      screen: { width: 100, height: 200, scale: 1, fontScale: 1 },
    });
    expect(service.dimensions()).toBe(initial);

    // Different metrics: signal updates.
    capturedListener?.({
      window: { width: 300, height: 400, scale: 2, fontScale: 2 },
      screen: { width: 300, height: 400, scale: 2, fontScale: 2 },
    });
    expect(service.dimensions()).toEqual({ width: 300, height: 400, scale: 2, fontScale: 2 });

    unmount(ROOT_TAG);
    expect(remove).toHaveBeenCalledOnce();
  });

  // why: the constructor comment ("Re-check once after subscribing to close the gap between
  // construction and the listener") documents a real race: the signal's initial value is read
  // by `Dimensions.get('window')` at field-init time, then `addEventListener` runs — if window
  // metrics changed in that window, the FIRST `change` event has already fired-and-gone before
  // the listener attached, and the signal would be stuck on stale metrics forever with no
  // second event ever coming. This was previously undocumented by any test — asserting on it
  // proves the re-check line actually does what its own comment claims, not just that it exists.
  it('WindowDimensionsService catches a metrics change that happened before the listener attached', async () => {
    const staleMetrics = { width: 100, height: 200, scale: 1, fontScale: 1 };
    const currentMetrics = { width: 300, height: 400, scale: 2, fontScale: 2 };
    // First call = the signal's field initializer; every call after (including the
    // constructor's own post-subscribe re-check) reflects the metrics having since changed.
    vi.spyOn(Dimensions, 'get').mockReturnValueOnce(staleMetrics).mockReturnValue(currentMetrics);
    vi.spyOn(Dimensions, 'addEventListener').mockReturnValue({ remove: vi.fn() });

    mount(ROOT_TAG, WindowDimensionsConsumer);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const service = capturedWindowDimensionsService;
    if (!service) throw new Error('WindowDimensionsService was not captured');

    expect(service.dimensions()).toEqual(currentMetrics);
  });
});
