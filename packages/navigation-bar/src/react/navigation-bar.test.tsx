// React twin of expo-navigation-bar's own declarative `<NavigationBar>` component, mounted
// through this repo's own harness (real Fabric recording, not `@testing-library/react-native`)

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { INavigationBarProps } from '../core';

const { pushStackEntry, popStackEntry, replaceStackEntry, useColorScheme } =
  vi.hoisted(() => ({
    pushStackEntry: vi.fn((props: unknown) => props),
    popStackEntry: vi.fn(),
    replaceStackEntry: vi.fn((_entry: unknown, props: unknown) => props),
    useColorScheme: vi.fn(() => 'light'),
  }));

vi.mock('../core', () => ({
  pushStackEntry,
  popStackEntry,
  replaceStackEntry,
}));
vi.mock('@symbiote-native/react', async importOriginal => ({
  ...(await importOriginal<typeof import('@symbiote-native/react')>()),
  useColorScheme,
}));

const { NavigationBar } = await import('./navigation-bar');

const ROOT_TAG = 978;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let updateHarnessProps: ((props: INavigationBarProps) => void) | undefined;

function Harness({
  initial,
}: {
  initial: INavigationBarProps;
}): React.ReactElement {
  const [props, setProps] = useState<INavigationBarProps>(initial);
  updateHarnessProps = setProps;
  return <NavigationBar style={props.style} hidden={props.hidden} />;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  useColorScheme.mockReturnValue('light');
  updateHarnessProps = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('NavigationBar (Positive: pushes/replaces/pops a stack entry across its lifecycle)', () => {
  it('pushes a stack entry on mount with its initial props', async () => {
    mount(ROOT_TAG, <Harness initial={{ style: 'dark', hidden: true }} />);
    await tick();

    expect(pushStackEntry).toHaveBeenCalledWith({
      style: 'dark',
      hidden: true,
    });
  });

  it('reads the current color scheme, so an auto style stays reactive to it', async () => {
    mount(ROOT_TAG, <Harness initial={{ style: 'auto' }} />);
    await tick();

    expect(useColorScheme).toHaveBeenCalled();
  });

  it('pops the stack entry on unmount', async () => {
    mount(ROOT_TAG, <Harness initial={{ style: 'dark' }} />);
    await tick();

    unmount(ROOT_TAG);

    expect(popStackEntry).toHaveBeenCalledTimes(1);
  });

  it('replaces the stack entry when its own props change', async () => {
    mount(ROOT_TAG, <Harness initial={{ style: 'dark', hidden: false }} />);
    await tick();
    replaceStackEntry.mockClear();

    updateHarnessProps?.({ style: 'light', hidden: true });

    await vi.waitFor(() =>
      expect(replaceStackEntry).toHaveBeenCalledWith(
        { style: 'dark', hidden: false },
        { style: 'light', hidden: true },
      ),
    );
  });
});
