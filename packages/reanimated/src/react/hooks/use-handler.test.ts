import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it } from 'vitest';
import { renderHook } from '../../../test-support/render-hook';
import { workletOf } from '../../../test-support/worklet';
import { useHandler } from './use-handler';

installRecordingFabric();

function handlers(hash: number, closure: unknown[] = []) {
  return { onScroll: workletOf(() => undefined, closure, hash) };
}

describe('useHandler', () => {
  it('reports changed dependencies the first time it sees the handlers', () => {
    const hook = renderHook(() => useHandler(handlers(1)), undefined);

    expect(hook.latest().doDependenciesDiffer).toBe(true);
  });

  it('reports unchanged dependencies for the same worklets once committed', () => {
    const hook = renderHook(() => useHandler(handlers(1, [5])), undefined);

    hook.rerender(undefined);

    expect(hook.latest().doDependenciesDiffer).toBe(false);
  });

  it('reports changed dependencies when a worklet changes', () => {
    const hook = renderHook((hash: number) => useHandler(handlers(hash)), 1);

    hook.rerender(2);

    expect(hook.latest().doDependenciesDiffer).toBe(true);
  });

  it('hands out one context for the life of the component', () => {
    const hook = renderHook(() => useHandler(handlers(1)), undefined);
    const first = hook.latest().context;

    hook.rerender(undefined);

    expect(hook.latest().context).toBe(first);
  });

  it('refuses handlers that are not worklets', () => {
    expect(() =>
      renderHook(() => useHandler({ onScroll: () => undefined }), undefined),
    ).toThrow(/worklet/i);
  });
});
