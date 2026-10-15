import { createLiveTree } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/solid';
import { afterEach, describe, expect, it } from 'vitest';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { SharedTransitionBoundary } from './shared-transition-boundary';

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 20_701;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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

async function mountTree(App: () => unknown) {
  mount(ROOT_TAG, App);
  await tick();
}

describe('SharedTransitionBoundary', () => {
  it('is a native boundary view that carries whether it is active', async () => {
    await mountTree(() => <SharedTransitionBoundary isActive />);

    expect(boundary().payload.isActive).toBe(true);
  });

  it('takes no part in layout and lets touches through to its children', async () => {
    await mountTree(() => <SharedTransitionBoundary isActive={false} />);

    expect(boundary().payload).toMatchObject({
      display: 'contents',
      overflow: 'visible',
      pointerEvents: 'box-none',
    });
  });

  it('holds its children', async () => {
    await mountTree(() => (
      <SharedTransitionBoundary isActive>
        <view testID="inside" />
      </SharedTransitionBoundary>
    ));

    expect(boundary().children.map(child => child.payload.testID)).toEqual([
      'inside',
    ]);
  });
});
