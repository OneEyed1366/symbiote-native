// `useColorScheme` of Vue: the scheme read at setup, re-read on mount, replaced on every change

import { defineComponent, h, type Ref, type VNode } from '@vue/runtime-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Appearance, type IColorSchemeName } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useColorScheme } from './use-color-scheme';

const ROOT_TAG = 90_513;
installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IListener = (preferences: {
  colorScheme: IColorSchemeName | null;
}) => void;

function fakeAppearance(initial: IColorSchemeName | null) {
  let listener: IListener | undefined;
  const remove = vi.fn();
  vi.spyOn(Appearance, 'getColorScheme').mockImplementation(() => initial);
  vi.spyOn(Appearance, 'addChangeListener').mockImplementation(next => {
    listener = next;
    return { remove };
  });
  return {
    remove,
    emit: (next: IColorSchemeName | null): void => {
      listener?.({ colorScheme: next });
    },
  };
}

function mountProbe(): Ref<IColorSchemeName | null> {
  let colorScheme: Ref<IColorSchemeName | null> | undefined;
  const Probe = defineComponent(() => {
    colorScheme = useColorScheme();
    return (): VNode => h('view');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
  if (colorScheme === undefined) throw new Error('the probe did not set up');
  return colorScheme;
}

afterEach(() => {
  unmount(ROOT_TAG);
  vi.restoreAllMocks();
});

describe('useColorScheme', () => {
  it('starts from the current scheme', async () => {
    fakeAppearance('light');
    const scheme = mountProbe();
    await tick();

    expect(scheme.value).toBe('light');
  });

  it('follows each change', async () => {
    const native = fakeAppearance('light');
    const scheme = mountProbe();
    await tick();

    native.emit('dark');

    expect(scheme.value).toBe('dark');
  });

  it('is null while the device reports no scheme', async () => {
    fakeAppearance(null);
    const scheme = mountProbe();
    await tick();

    expect(scheme.value).toBeNull();
  });

  it('stops listening on unmount', async () => {
    const native = fakeAppearance('light');
    mountProbe();
    await tick();

    unmount(ROOT_TAG);

    expect(native.remove).toHaveBeenCalledTimes(1);
  });
});
