import { createElement, createSurface } from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { getViewProp } from './view-prop';

const host = installWrapperHost();
const PROXY = '__reanimatedModuleProxy';

type IAnswer = (result: unknown) => void;
const asked =
  vi.fn<(wrapper: unknown, propName: string, answer: IAnswer) => void>();

beforeEach(() => {
  asked.mockReset();
  Object.defineProperty(globalThis, PROXY, {
    value: { getViewProp: asked },
    configurable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, PROXY);
});

function committedNode() {
  const surface = createSurface(19_501);
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

describe('getViewProp', () => {
  it('asks the native module for the prop of the wrapper of the node', async () => {
    const node = committedNode();
    asked.mockImplementation((_wrapper, _name, answer) => answer(0.5));

    const value = await getViewProp(7, 'opacity', node);

    expect(value).toBe(0.5);
    expect(asked.mock.calls[0]?.[0]).toBe(host.wrapperOf(node));
    expect(asked.mock.calls[0]?.[1]).toBe('opacity');
  });

  it('rejects with the message native answers an error with', async () => {
    const node = committedNode();
    asked.mockImplementation((_wrapper, _name, answer) =>
      answer('error: no such prop'),
    );

    await expect(getViewProp(7, 'nope', node)).rejects.toBe(
      'error: no such prop',
    );
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
