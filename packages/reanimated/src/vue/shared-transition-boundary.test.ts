import { createLiveTree } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/vue';
import { h, nextTick } from '@vue/runtime-core';
import { afterEach, describe, expect, it } from 'vitest';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { View } from './animated';
import { SharedTransitionBoundary } from './shared-transition-boundary';

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 20_501;

afterEach(() => {
  unmount(ROOT_TAG);
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

async function mountTree(tree: ReturnType<typeof h>) {
  mount(ROOT_TAG, { render: () => tree });
  await nextTick();
}

describe('SharedTransitionBoundary', () => {
  it('is a native boundary view that carries whether it is active', async () => {
    await mountTree(h(SharedTransitionBoundary, { isActive: true }));

    expect(boundary().payload.isActive).toBe(true);
  });

  it('takes no part in layout and lets touches through to its children', async () => {
    await mountTree(h(SharedTransitionBoundary, { isActive: false }));

    expect(boundary().payload).toMatchObject({
      display: 'contents',
      overflow: 'visible',
      pointerEvents: 'box-none',
    });
  });

  it('holds its children', async () => {
    await mountTree(
      h(SharedTransitionBoundary, { isActive: true }, () =>
        h(View, { testID: 'inside' }),
      ),
    );

    expect(boundary().children.map(child => child.payload.testID)).toEqual([
      'inside',
    ]);
  });
});
