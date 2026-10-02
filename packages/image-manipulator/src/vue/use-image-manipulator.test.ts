// Vue twin of `../react`'s `useImageManipulator` test

import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { manipulate } = vi.hoisted(() => ({ manipulate: vi.fn() }));

vi.mock('../core', () => ({ manipulate }));

const { useImageManipulator } = await import('./use-image-manipulator');

const ROOT_TAG = 995;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createContext(): { release: ReturnType<typeof vi.fn> } {
  return { release: vi.fn() };
}

let captured: ReturnType<typeof useImageManipulator> | undefined;
let source: ReturnType<typeof ref<string>>;

function mountHarness(initial: string): void {
  source = ref(initial);
  const Probe = defineComponent(() => {
    captured = useImageManipulator(source);
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  manipulate.mockImplementation(createContext);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useImageManipulator (Positive: creates once, recreates on source change, releases the stale one)', () => {
  it('creates a context for the initial source', async () => {
    mountHarness('uri-1');
    await tick();

    expect(manipulate).toHaveBeenCalledWith('uri-1');
    expect(captured?.value).toBeDefined();
  });

  it('returns the same context when the source ref is unchanged', async () => {
    mountHarness('uri-1');
    await tick();
    const first = captured?.value;

    expect(captured?.value).toBe(first);
    expect(manipulate).toHaveBeenCalledTimes(1);
  });

  it('recreates and releases the stale context when the source changes', async () => {
    mountHarness('uri-1');
    await tick();
    const stale = captured?.value;

    source.value = 'uri-2';
    await tick();

    expect(captured?.value).not.toBe(stale);
    expect(stale?.release).toHaveBeenCalledTimes(1);
  });

  it('releases the current context on unmount', async () => {
    mountHarness('uri-1');
    await tick();
    const current = captured?.value;

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
