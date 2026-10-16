// `RootTagContext` of RN: the tag of the surface a component is rendered into
import { createElement, useContext } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RootTagContext, mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const FIRST_TAG = 90_420;
const SECOND_TAG = 90_421;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function readTagInto(sink: number[]): () => null {
  return function ReadTag(): null {
    sink.push(useContext(RootTagContext));
    return null;
  };
}

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(FIRST_TAG);
  unmount(SECOND_TAG);
});

describe('RootTagContext', () => {
  it('carries the tag a component is mounted under', async () => {
    const seen: number[] = [];
    mount(FIRST_TAG, createElement(readTagInto(seen)));
    await tick();

    expect(seen).toEqual([FIRST_TAG]);
  });

  it('keeps two surfaces apart', async () => {
    const first: number[] = [];
    const second: number[] = [];
    mount(FIRST_TAG, createElement(readTagInto(first)));
    mount(SECOND_TAG, createElement(readTagInto(second)));
    await tick();

    expect([first, second]).toEqual([[FIRST_TAG], [SECOND_TAG]]);
  });
});
