import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it } from 'vitest';
import { renderComposable } from '../../../test-support/render-composable';
import { workletOf } from '../../../test-support/worklet';
import { useHandler } from './use-handler';

installRecordingFabric();

function handlers(hash: number) {
  return { onScroll: workletOf(() => undefined, [], hash) };
}

describe('useHandler', () => {
  it('reports changed dependencies, as setup sees the handlers for the first time', () => {
    const composable = renderComposable(() => useHandler(handlers(1)));

    expect(composable.result().doDependenciesDiffer).toBe(true);
  });

  it('hands out one context to share between the worklets', () => {
    const composable = renderComposable(() => useHandler(handlers(1)));

    expect(composable.result().context).toBe(composable.result().context);
  });

  it('refuses handlers that are not worklets', () => {
    expect(() => useHandler({ onScroll: () => undefined })).toThrow(/worklet/i);
  });
});
