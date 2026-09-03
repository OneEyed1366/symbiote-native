// Co-located Solid-driven test for createClipboard, the Solid twin of
// vue/composables/use-clipboard's own test — same scenarios, driven through `createRoot` + an
// explicit `dispose` instead of mount/unmount, because this primitive renders nothing (no Fabric
// surface, so no installFabric()).
//
// Mocks the whole core module (never expo-modules-core internals): the native-call contract is
// core/clipboard.test.ts's job. The fake stands in for a real emitter — `remove()` actually drops
// the listener — so "stops updating after dispose" fails when the primitive never unsubscribes,
// rather than passing vacuously the way a spy on `remove` would.

import { createEffect, createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IClipboardEvent } from '../../core';
// Imported from the types module directly (not the mocked `../../core` barrel below) — a pure enum
// declaration with no expo-modules-core native resolution, so it is safe to import unmocked here
// purely to build type-correct fixture events.
import { ContentType } from '../../core/types';
import { createClipboard } from './create-clipboard';

type IListener = (event: IClipboardEvent) => void;

const { listeners } = vi.hoisted(() => ({ listeners: new Set<IListener>() }));

vi.mock('../../core', () => ({
  addClipboardListener: (listener: IListener) => {
    listeners.add(listener);
    return {
      remove: () => {
        listeners.delete(listener);
      },
    };
  },
}));

// Play native: dispatch to whoever is still subscribed.
function emit(event: IClipboardEvent): void {
  for (const listener of listeners) listener(event);
}

const COPIED_TEXT: IClipboardEvent = { contentTypes: [ContentType.PLAIN_TEXT] };
const COPIED_IMAGE: IClipboardEvent = { contentTypes: [ContentType.IMAGE] };

beforeEach(() => {
  listeners.clear();
});

// `createEffect` is a USER effect, deferred to the end of the enclosing `runUpdates`, so one
// created inside `createRoot`'s callback has not run when that callback returns. Build inside the
// root, assert outside — the ordering a component gets. Same helper as
// adapters/solid/src/primitives/primitives.test.ts.
function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

describe('createClipboard (Solid) — lifecycle wiring over core, no throwing path', () => {
  // why: a consumer subscribing mid-session must not see stale/undefined state before the first
  // native event — `null` means "no clipboard change observed yet".
  it('starts null before any clipboard-change event arrives', () => {
    const { value: event, dispose } = inRoot(createClipboard);

    expect(event()).toBeNull();

    dispose();
  });

  // why: a Solid body runs ONCE, so the event has to arrive through an accessor — read here from a
  // tracked scope too, since a value that only updates when polled would never re-run a consumer's
  // effect. The payload is passed through unmodified; reshaping it here would duplicate core's job.
  it('pushes the native event through the accessor, unmodified', () => {
    const seen: (IClipboardEvent | null)[] = [];
    const { value: event, dispose } = inRoot(() => {
      const clipboard = createClipboard();
      createEffect(() => {
        seen.push(clipboard());
      });
      return clipboard;
    });

    emit(COPIED_TEXT);

    expect(event()).toEqual(COPIED_TEXT);
    expect(seen).toEqual([null, COPIED_TEXT]);

    dispose();
  });

  // why: the subscription is taken synchronously in the primitive body, not from a mount hook —
  // a second subscription would mean the body's work leaked into something that re-runs.
  it('subscribes exactly once', () => {
    const { dispose } = inRoot(createClipboard);

    expect(listeners.size).toBe(1);

    dispose();
  });

  // why: a disposed owner must not keep a live native subscription — a leaked listener writes into
  // a scope nobody reads and holds the native EventEmitter entry forever.
  it('unsubscribes on dispose', () => {
    const { value: event, dispose } = inRoot(createClipboard);
    emit(COPIED_TEXT);
    expect(event()).toEqual(COPIED_TEXT);

    dispose();

    expect(listeners.size).toBe(0);
    emit(COPIED_IMAGE);
    expect(event()).toEqual(COPIED_TEXT);
  });
});
