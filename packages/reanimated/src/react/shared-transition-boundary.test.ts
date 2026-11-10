import { act, createElement } from 'react';
import { mount, unmount } from '@symbiote-native/react';
import { createLiveTree } from '@symbiote-native/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { View } from './animated';
import { SharedTransitionBoundary } from './shared-transition-boundary';

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 20_001;

afterEach(() => {
  act(() => unmount(ROOT_TAG));
  host.fabric.reset();
});

function boundary() {
  const found = host.fabric.findAll(
    node => node.viewName === 'REASharedTransitionBoundary',
  );
  const [only] = found;
  if (found.length !== 1 || only === undefined) {
    throw new Error(`expected one boundary, found ${found.length}`);
  }
  return live.nodeOf(only.handle);
}

describe('SharedTransitionBoundary', () => {
  it('is a native boundary view that carries whether it is active', () => {
    act(() =>
      mount(
        ROOT_TAG,
        createElement(SharedTransitionBoundary, { isActive: true }),
      ),
    );

    expect(boundary().payload.isActive).toBe(true);
  });

  it('takes no part in layout and lets touches through to its children', () => {
    act(() =>
      mount(
        ROOT_TAG,
        createElement(SharedTransitionBoundary, { isActive: false }),
      ),
    );

    expect(boundary().payload).toMatchObject({
      display: 'contents',
      overflow: 'visible',
      pointerEvents: 'box-none',
    });
  });

  it('holds its children', () => {
    act(() =>
      mount(
        ROOT_TAG,
        createElement(
          SharedTransitionBoundary,
          { isActive: true },
          createElement(View, { testID: 'inside' }),
        ),
      ),
    );

    expect(boundary().children.map(child => child.payload.testID)).toEqual([
      'inside',
    ]);
  });
});
