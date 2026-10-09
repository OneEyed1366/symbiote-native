// A `ShadowNodeWrapper` can only be built by the native host, so the engine must hand the host the
// placeholder node and pass its answer through untouched
import { describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import {
  createElement,
  createSurface,
  getFamilyGeneration,
  getShadowNodeWrapper,
} from '../index';
import { setTreeHost, treeHost, type ITreeHost } from '../tree-host';

installRecordingFabric();
let nextRootTag = 9_600;

function mounted() {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

function withHost(overrides: Partial<ITreeHost>, body: () => void) {
  const real = treeHost();
  if (real === undefined)
    throw new Error('no host installed, installRecordingFabric() did not run');
  setTreeHost({ ...real, ...overrides });
  try {
    body();
  } finally {
    setTreeHost(real);
  }
}

describe('getShadowNodeWrapper', () => {
  it('hands the host the node itself and returns the host answer as is', () => {
    const node = mounted();
    const wrapper = { name: 'wrapper' };
    const shadowNodeWrapperOf = vi.fn(() => wrapper);

    withHost({ shadowNodeWrapperOf }, () => {
      expect(getShadowNodeWrapper(node)).toBe(wrapper);
      expect(shadowNodeWrapperOf).toHaveBeenCalledWith(node);
    });
  });

  it('answers undefined on a host that cannot build one', () => {
    const node = mounted();

    withHost({ shadowNodeWrapperOf: undefined }, () => {
      expect(getShadowNodeWrapper(node)).toBeUndefined();
    });
  });
});

describe('getFamilyGeneration', () => {
  it('reads the generation off the committed record', () => {
    const node = mounted();
    const real = treeHost();

    withHost(
      {
        committedRecordOf: handle => {
          const record = real?.committedRecordOf(handle);
          return record === undefined
            ? undefined
            : { ...record, familyGeneration: 3 };
        },
      },
      () => {
        expect(getFamilyGeneration(node)).toBe(3);
      },
    );
  });

  it('answers undefined when the host record carries none', () => {
    expect(getFamilyGeneration(mounted())).toBeUndefined();
  });

  it('answers undefined for a node that never committed', () => {
    expect(getFamilyGeneration(createElement('RCTView'))).toBeUndefined();
  });
});
