// React twin of expo-image-manipulator's `useImageManipulator`

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { manipulate } = vi.hoisted(() => ({ manipulate: vi.fn() }));

vi.mock('../core', () => ({ manipulate }));

const { useImageManipulator } = await import('./use-image-manipulator');

const ROOT_TAG = 994;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createContext(): { release: ReturnType<typeof vi.fn> } {
  return { release: vi.fn() };
}

let captured: ReturnType<typeof useImageManipulator> | undefined;
let updateSource: ((source: string) => void) | undefined;

function Harness({ initial }: { initial: string }): null {
  const [source, setSource] = useState(initial);
  updateSource = setSource;
  captured = useImageManipulator(source);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  updateSource = undefined;
  manipulate.mockImplementation(createContext);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useImageManipulator (Positive: creates once, recreates on source change, releases the stale one)', () => {
  it('creates a context for the initial source', async () => {
    mount(ROOT_TAG, <Harness initial="uri-1" />);
    await tick();

    expect(manipulate).toHaveBeenCalledWith('uri-1');
    expect(captured).toBeDefined();
  });

  it('returns the same context across re-renders with an unchanged source', async () => {
    mount(ROOT_TAG, <Harness initial="uri-1" />);
    await tick();
    const first = captured;

    updateSource?.('uri-1');
    await tick();

    expect(captured).toBe(first);
    expect(manipulate).toHaveBeenCalledTimes(1);
  });

  it('recreates and releases the stale context when the source changes', async () => {
    mount(ROOT_TAG, <Harness initial="uri-1" />);
    await tick();
    const stale = captured;

    updateSource?.('uri-2');
    await vi.waitFor(() => expect(manipulate).toHaveBeenCalledTimes(2));
    await tick();

    expect(captured).not.toBe(stale);
    expect(stale?.release).toHaveBeenCalledTimes(1);
  });

  it('releases the current context on unmount', async () => {
    mount(ROOT_TAG, <Harness initial="uri-1" />);
    await tick();
    const current = captured;

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
