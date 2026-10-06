// RN Image-itest "loading progress": each native event reaches its own prop exactly once

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const fabric = installRecordingFabric();
const ROOT_TAG = 12;

const EVENTS = [
  ['onError', 'topError'],
  ['onLoadStart', 'topLoadStart'],
  ['onProgress', 'topProgress'],
  ['onLoad', 'topLoad'],
  ['onLoadEnd', 'topLoadEnd'],
] as const;

type IProp = (typeof EVENTS)[number][0];

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('<image> load events', () => {
  it.each(EVENTS)(
    '%s fires once for %s and for no other prop',
    (prop, event) => {
      const calls: IProp[] = [];
      const record = (name: IProp) => () => {
        calls.push(name);
      };
      mount(
        ROOT_TAG,
        <image
          source={{ uri: 'http://x/y.png' }}
          onError={record('onError')}
          onLoadStart={record('onLoadStart')}
          onProgress={record('onProgress')}
          onLoad={record('onLoad')}
          onLoadEnd={record('onLoadEnd')}
        />,
      );
      expect(calls).toEqual([]);

      const node = fabric.find(one => one.viewName === 'RCTImageView');
      if (node === undefined) throw new Error('no RCTImageView was created');
      fabric.fireEvent(node.instanceHandle, event, {});

      expect(calls).toEqual([prop]);
    },
  );
});
