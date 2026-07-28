// Co-located React-driven test (ADR 0025) for useClipboard. Mocks the whole `core` module
// rather than expo-modules-core internals — this hook's own lifecycle wiring
// (subscribe/unsubscribe) is what's under test, not the core port itself, which already has its
// own coverage in packages/clipboard/src/core/clipboard.test.ts.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useClipboard } from './index';
import type { IClipboardEvent } from '../../../core';
// Imported from the types module directly (not the mocked `../../../core` barrel below) — a
// pure enum declaration with no expo-modules-core native resolution, so it's safe to import
// unmocked here purely to build a type-correct fixture event.
import { ContentType } from '../../../core/types';

const { addClipboardListener, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    addClipboardListener: vi.fn((_listener: (event: IClipboardEvent) => void) => ({ remove })),
    remove,
  };
});

vi.mock('../../../core', () => ({ addClipboardListener }));

const ROOT_TAG = 902;

const results: Array<IClipboardEvent | null> = [];

function Probe(): ReactElement {
  results.push(useClipboard());
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
});

afterEach(() => unmount(ROOT_TAG));

describe('useClipboard', () => {
  it('reports null before any clipboard-change event arrives', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toBeNull();
  });

  it('updates to the latest event once the native listener fires', async () => {
    mount(ROOT_TAG, createElement(Probe));

    const event: IClipboardEvent = { contentTypes: ['plain-text' as ContentType] };
    const listener = addClipboardListener.mock.calls[0][0];
    listener(event);

    // The mock invokes the listener directly, outside the engine's event dispatcher
    // (setEventDispatcher in render.ts), which is what normally flushes a native-driven
    // setState synchronously — so the resulting re-render lands on a later microtask here.
    await vi.waitFor(() => expect(results[results.length - 1]).toEqual(event));
  });

  it('unsubscribes from the native listener on unmount', () => {
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
