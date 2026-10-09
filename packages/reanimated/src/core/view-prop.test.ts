import { createElement, createSurface } from '@symbiote-native/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from 'react-native-reanimated/src/core';
import { getShadowNodeWrapperFromRef } from 'react-native-reanimated/src/fabricUtils.native';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { getViewProp } from './view-prop';

vi.mock('react-native-reanimated/src/core', async importOriginal => ({
  ...(await importOriginal<typeof core>()),
  getViewProp: vi.fn(),
}));

const host = installWrapperHost();
const upstream = vi.mocked(core.getViewProp);

beforeEach(() => upstream.mockReset());

function committedNode() {
  const surface = createSurface(19_501);
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

describe('getViewProp', () => {
  it('asks upstream for the prop, with a component upstream can find the wrapper of', async () => {
    const node = committedNode();
    upstream.mockResolvedValue(0.5);

    const value = await getViewProp(7, 'opacity', node);

    expect(value).toBe(0.5);
    const [tag, name, component] = upstream.mock.calls[0] ?? [];
    expect(tag).toBe(7);
    expect(name).toBe('opacity');
    if (component === undefined || component === null) {
      throw new Error('no component was handed over');
    }
    expect(getShadowNodeWrapperFromRef(component)).toBe(host.wrapperOf(node));
  });

  it('refuses a node that has not committed, as upstream refuses a missing component', () => {
    const node = createElement('RCTView');

    expect(() => getViewProp(7, 'opacity', node)).toThrow(
      /requires a component/,
    );
  });

  it('refuses no node at all', () => {
    expect(() => getViewProp(7, 'opacity', null)).toThrow(
      /requires a component/,
    );
  });
});
