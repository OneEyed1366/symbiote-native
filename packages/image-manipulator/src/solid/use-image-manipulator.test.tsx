// Solid twin of `../react`'s `useImageManipulator` test

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { manipulate } = vi.hoisted(() => ({ manipulate: vi.fn() }));

vi.mock('../core', () => ({ manipulate }));

const { useImageManipulator } = await import('./use-image-manipulator');

const ROOT_TAG = 996;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createContext(): { release: ReturnType<typeof vi.fn> } {
  return { release: vi.fn() };
}

let captured: ReturnType<typeof useImageManipulator> | undefined;
let setSource: ((source: string) => void) | undefined;

function Probe(): null {
  const [source, setter] = createSignal('uri-1');
  setSource = setter;
  captured = useImageManipulator(source);
  return null;
}

function mountHarness(): void {
  mount(ROOT_TAG, () => <Probe />);
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  setSource = undefined;
  manipulate.mockImplementation(createContext);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useImageManipulator (Positive: creates once, recreates on source change, releases the stale one)', () => {
  it('creates a context for the initial source', async () => {
    mountHarness();
    await tick();

    expect(manipulate).toHaveBeenCalledWith('uri-1');
    expect(captured?.()).toBeDefined();
  });

  it('recreates and releases the stale context when the source changes', async () => {
    mountHarness();
    await tick();
    const stale = captured?.();

    setSource?.('uri-2');
    await tick();

    expect(captured?.()).not.toBe(stale);
    expect(stale?.release).toHaveBeenCalledTimes(1);
  });

  it('releases the current context on unmount', async () => {
    mountHarness();
    await tick();
    const current = captured?.();

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
