// Co-located Vue-driven test (ADR 0025) for useClipboard. Mocks the whole core module (never
// expo-modules-core internals) since this exercises composable mount/unmount lifecycle timing,
// not any native view — there is none here, so no ViewConfig fixture is needed.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import type { IClipboardEvent } from '../../../core';
// Imported from the types module directly (not the mocked `../../../core` barrel below) — a
// pure enum declaration with no expo-modules-core native resolution, so it's safe to import
// unmocked here purely to build a type-correct fixture event.
import { ContentType } from '../../../core/types';
import { useClipboard } from './index';

const ROOT_TAG = 9822;

type IListener = (event: IClipboardEvent) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addClipboardListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});

vi.mock('../../../core', () => ({
  addClipboardListener: (listener: IListener) =>
    addClipboardListenerMock(listener),
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addClipboardListenerMock.mockClear();
  removeMock.mockClear();
});

afterEach(() => unmount(ROOT_TAG));

function mountClipboard(): Ref<IClipboardEvent | null> {
  let event: Ref<IClipboardEvent | null> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        event = useClipboard();
        return () => h('symbiote-text', {}, 'clipboard');
      },
    }),
  );
  if (event === undefined) {
    throw new Error('setup() did not run');
  }
  return event;
}

// This composable has no throwing path of its own — it only wires core's addClipboardListener
// into Vue's onMounted/onUnmounted lifecycle and mirrors whatever core hands it into a ref, so
// there is no Negative group here (core's own native-absent/throw contract is covered by
// packages/clipboard/src/core/clipboard.test.ts, not re-derived here).
describe('useClipboard (Vue) — lifecycle wiring over core, no throwing path', () => {
  // why: a subscriber mounting mid-session must not see stale/undefined state before the first
  // native event — Vue consumers rely on `null` meaning "no clipboard change observed yet"
  it('starts null before any clipboard-change event arrives', () => {
    const event = mountClipboard();

    expect(event.value).toBeNull();
  });

  // why: the composable must reflect whatever core's listener callback receives, unmodified —
  // any transformation here would duplicate core's own event-shaping responsibility
  it('updates the ref when the native listener fires', () => {
    const event = mountClipboard();
    const fired: IClipboardEvent = { contentTypes: [ContentType.IMAGE] };

    registeredListener?.(fired);

    expect(event.value).toEqual(fired);
  });

  // why: an unmounted component must not keep a live native subscription — a leaked listener
  // keeps writing to a ref no component reads anymore and leaks the native EventEmitter entry
  it('removes the subscription on unmount', () => {
    mountClipboard();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
