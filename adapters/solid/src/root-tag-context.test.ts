// The tag of the surface a component is rendered into, read through Solid's own context API
import { useContext } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { RootTagContext } from './index';
import { mount, unmount } from './render';

const FIRST_TAG = 90_450;
const SECOND_TAG = 90_451;
const fabric = installRecordingFabric();

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
  it('carries the tag a component is mounted under', () => {
    const seen: number[] = [];
    mount(FIRST_TAG, readTagInto(seen));

    expect(seen).toEqual([FIRST_TAG]);
  });

  it('keeps two surfaces apart', () => {
    const first: number[] = [];
    const second: number[] = [];
    mount(FIRST_TAG, readTagInto(first));
    mount(SECOND_TAG, readTagInto(second));

    expect([first, second]).toEqual([[FIRST_TAG], [SECOND_TAG]]);
  });

  it('reads 0 outside any mounted surface, as RN does', () => {
    expect(useContext(RootTagContext)).toBe(0);
  });
});
