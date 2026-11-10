import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  clearGlobalStyles,
  createElement,
  createSurface,
  registerRules,
  registerStyleClaim,
  routeProp,
} from '../index';
import { resetMutationBuffer, takeBatch } from '../mutation-buffer';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 9_800;

function committedWith(
  write: (node: ReturnType<typeof createElement>) => void,
) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  write(node);
  surface.appendChild(node);
  surface.commit();
  return live.nodeOf(node);
}

const releases: Array<() => void> = [];

function claimingAnimationKeys(receive = vi.fn()) {
  releases.push(
    registerStyleClaim({ owns: key => key.startsWith('animation'), receive }),
  );
  return receive;
}

afterEach(() => {
  for (const release of releases.splice(0)) release();
  clearGlobalStyles();
});

describe('a registered style claim', () => {
  it('keeps the claimed keys of an authored style out of the payload', () => {
    claimingAnimationKeys();

    const committed = committedWith(node => {
      routeProp(node, 'style', { animationName: 'fade', width: 10 });
    });

    expect(committed.payload.width).toBe(10);
    expect(Object.hasOwn(committed.payload, 'animationName')).toBe(false);
  });

  it('keeps the claimed keys of a class style out of the payload', () => {
    // Built apart so the literal skips the excess-property check: the CSS compiler emits these keys
    // before the style types know them
    const fadingStyle = { animationName: 'fade', width: 10 };
    registerRules([
      {
        tokens: ['fading'],
        specificity: [0, 1, 0],
        order: 0,
        style: fadingStyle,
      },
    ]);
    claimingAnimationKeys();

    const committed = committedWith(node => {
      routeProp(node, 'className', 'fading');
    });

    expect(committed.payload.width).toBe(10);
    expect(Object.hasOwn(committed.payload, 'animationName')).toBe(false);
  });

  it('keeps the claimed keys out of a style written as an array', () => {
    claimingAnimationKeys();

    const committed = committedWith(node => {
      routeProp(node, 'style', [{ animationName: 'fade' }, { width: 10 }]);
    });

    expect(committed.payload.width).toBe(10);
    expect(Object.hasOwn(committed.payload, 'animationName')).toBe(false);
  });

  it('hands the claim the node and the keys it took, with their values', () => {
    const receive = claimingAnimationKeys();
    let written: ReturnType<typeof createElement> | undefined;

    committedWith(node => {
      written = node;
      routeProp(node, 'style', {
        animationName: 'fade',
        animationDuration: '2s',
        width: 10,
      });
    });

    expect(receive).toHaveBeenLastCalledWith(written, {
      animationName: 'fade',
      animationDuration: '2s',
    });
  });

  it('tells the claim the keys are gone when the style stops carrying them', () => {
    const receive = claimingAnimationKeys();
    const node = createElement('RCTView');
    routeProp(node, 'style', { animationName: 'fade', width: 10 });

    routeProp(node, 'style', { width: 10, height: 4 });

    expect(receive).toHaveBeenLastCalledWith(node, {});
  });

  it('leaves a style with none of the claimed keys as the very object it was', () => {
    claimingAnimationKeys();
    resetMutationBuffer();
    const style = { height: 44, flexDirection: 'row' };
    for (let at = 0; at < 5; at += 1) {
      routeProp(createElement('RCTView'), 'style', style);
    }

    const arrays = takeBatch().values.filter(value => Array.isArray(value));
    expect(arrays.length).toBe(1);
    expect(arrays[0]).toEqual([undefined, style]);
  });

  it('publishes nothing again when the same style object is written twice', () => {
    claimingAnimationKeys();
    const node = createElement('RCTView');
    const style = { animationName: 'fade', width: 10 };
    routeProp(node, 'style', style);
    resetMutationBuffer();
    takeBatch();

    routeProp(node, 'style', style);

    expect(takeBatch().values.length).toBe(0);
  });

  it('shares one published array between nodes carrying the same claimed style', () => {
    claimingAnimationKeys();
    resetMutationBuffer();
    const style = { animationName: 'fade', width: 10 };
    for (let at = 0; at < 5; at += 1) {
      routeProp(createElement('RCTView'), 'style', style);
    }

    const arrays = takeBatch().values.filter(value => Array.isArray(value));
    expect(arrays.length).toBe(1);
  });

  it('lets the keys through once released', () => {
    const release = registerStyleClaim({
      owns: key => key.startsWith('animation'),
      receive: vi.fn(),
    });
    release();

    const committed = committedWith(node => {
      routeProp(node, 'style', { animationName: 'fade', width: 10 });
    });

    expect(committed.payload.animationName).toBe('fade');
  });
});
