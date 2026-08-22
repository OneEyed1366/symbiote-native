// Co-located Angular-driven test (ADR 0025) for ClipboardService. Mounts a real host component
// through @symbiote-native/angular so `connect()` runs the same way an app would call it —
// inside the component's own injection context — and drives the returned signal through a full
// mount/unmount lifecycle, because `effect()`'s injector-scoped cleanup only fires correctly
// when torn down through a real Angular injection context.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import type { IClipboardEvent } from '../../../core';
// Imported from the types module directly (not the mocked `../../../core` barrel below) — a
// pure enum declaration with no expo-modules-core native resolution, so it's safe to import
// unmocked here purely to build a type-correct fixture event.
import { ContentType } from '../../../core/types';
import { ClipboardService } from './index';

const addClipboardListenerMock = vi.fn();
const removeMock = vi.fn();

vi.mock('../../../core', () => ({
  addClipboardListener: (listener: (event: IClipboardEvent) => void) =>
    addClipboardListenerMock(listener),
}));

const ROOT_TAG = 942;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const EVENT: IClipboardEvent = { contentTypes: [ContentType.HTML] };

let capturedResult: Signal<IClipboardEvent | null> | undefined;
let capturedListener: ((event: IClipboardEvent) => void) | undefined;

@Component({
  selector: 'symbiote-clipboard-host',
  standalone: true,
  template: '',
})
class ClipboardHost {
  readonly clipboardEvent = inject(ClipboardService).connect();

  constructor() {
    capturedResult = this.clipboardEvent;
  }
}

beforeEach(() => {
  capturedResult = undefined;
  capturedListener = undefined;
  addClipboardListenerMock.mockImplementation(listener => {
    capturedListener = listener;
    return { remove: removeMock };
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

// connect() has no throwing path of its own — it only wires core's addClipboardListener into an
// effect()-scoped signal, so there is no Negative group here (core's own native-absent/throw
// contract is covered by packages/clipboard/src/core/clipboard.test.ts, not re-derived here).
describe('ClipboardService.connect — lifecycle wiring over core, no throwing path', () => {
  // why: a subscriber connecting mid-session must not see stale/undefined state before the
  // first native event — Angular consumers rely on `null` meaning "no clipboard change observed
  // yet", exactly like the React/Vue equivalents
  it('reports null before any clipboard-change event fires', async () => {
    mount(ROOT_TAG, ClipboardHost);
    await tick();

    expect(capturedResult?.()).toBeNull();
  });

  // why: the signal must reflect whatever core's listener callback receives, unmodified — any
  // transformation here would duplicate core's own event-shaping responsibility
  it('updates the signal when the registered listener fires with an event', async () => {
    mount(ROOT_TAG, ClipboardHost);
    await tick();

    if (capturedListener === undefined)
      throw new Error('addClipboardListener callback was not captured');
    capturedListener(EVENT);

    expect(capturedResult?.()).toEqual(EVENT);
  });

  // why: an unmounted host must not keep a live native subscription — effect()'s injector-scoped
  // cleanup is what's actually under test here, not just a bare unsubscribe call
  it('removes the subscription when the host component is unmounted', async () => {
    mount(ROOT_TAG, ClipboardHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});
