// RN's `ScrollView-itest`: `onScroll` delivery and per-tick batching in Fabric's event queue

import { createElement } from 'react';

import { createRoot, findByViewName, render } from './culling-fixture';
import {
  beforeEach,
  describe,
  enqueueScroll,
  expect,
  it,
  mounted,
  report,
  runWorkLoop,
} from './harness';

type IOffset = { x: number; y: number };

// Mounts a ScrollView with an `onScroll` that records every offset it is handed
function mountRecording(): { offsets: IOffset[]; tag: number } {
  const offsets: IOffset[] = [];
  render(
    createElement('scroll-view', {
      onScroll: (event: { nativeEvent: { contentOffset: IOffset } }) => {
        offsets.push(event.nativeEvent.contentOffset);
      },
    }),
  );
  const target = findByViewName(mounted(), 'ScrollView');
  if (target === undefined) throw new Error('no ScrollView mounted');
  return { offsets, tag: target.tag };
}

describe('ScrollView onScroll', () => {
  beforeEach(() => createRoot(100, 100));

  it('delivers an onScroll event', () => {
    const { offsets, tag } = mountRecording();

    enqueueScroll(tag, 0, 1);
    runWorkLoop();

    expect(offsets).toEqual([{ x: 0, y: 1 }]);
  });

  it('batches onScroll events per UI tick', () => {
    const { offsets, tag } = mountRecording();

    enqueueScroll(tag, 0, 1);
    enqueueScroll(tag, 0, 2);
    runWorkLoop();

    expect(offsets).toEqual([{ x: 0, y: 2 }]);
  });
});

report();
