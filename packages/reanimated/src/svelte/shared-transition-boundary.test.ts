import { createLiveTree } from '@symbiote-native/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { mountSvelte } from '../../test-support/mount-svelte';
import Fixture from './shared-transition-boundary.fixture.svelte';

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 20_601;
let unmountTree = () => {};

afterEach(() => {
  unmountTree();
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
  it('is a native boundary view that carries whether it is active', async () => {
    unmountTree = await mountSvelte(ROOT_TAG, Fixture, { isActive: true });

    expect(boundary().payload.isActive).toBe(true);
  });

  it('takes no part in layout and lets touches through to its children', async () => {
    unmountTree = await mountSvelte(ROOT_TAG, Fixture, { isActive: false });

    expect(boundary().payload).toMatchObject({
      display: 'contents',
      overflow: 'visible',
      pointerEvents: 'box-none',
    });
  });

  it('holds its children', async () => {
    unmountTree = await mountSvelte(ROOT_TAG, Fixture, { withChild: true });

    expect(boundary().children.map(child => child.payload.testID)).toEqual([
      'inside',
    ]);
  });
});
