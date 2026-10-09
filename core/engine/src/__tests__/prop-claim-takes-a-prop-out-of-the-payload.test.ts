import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  createElement,
  createSurface,
  registerPropClaim,
  routeProp,
} from '../index';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 9_700;

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

function claiming(claim: Parameters<typeof registerPropClaim>[0]) {
  releases.push(registerPropClaim(claim));
}

afterEach(() => {
  for (const release of releases.splice(0)) release();
});

describe('a registered prop claim', () => {
  it('keeps the claimed prop out of the committed payload', () => {
    claiming((_node, key) => key === 'accessibilityLabel');

    const committed = committedWith(node => {
      routeProp(node, 'accessibilityLabel', 'claimed');
      routeProp(node, 'testID', 'kept');
    });

    expect(Object.hasOwn(committed.payload, 'accessibilityLabel')).toBe(false);
    expect(committed.payload.testID).toBe('kept');
  });

  it('hands the claim the node, the key and the value as written', () => {
    const claim = vi.fn(() => true);
    claiming(claim);

    let written: ReturnType<typeof createElement> | undefined;
    committedWith(node => {
      written = node;
      routeProp(node, 'accessibilityLabel', 'value');
    });

    expect(claim).toHaveBeenCalledWith(written, 'accessibilityLabel', 'value');
  });

  it('lets a prop it declines through to the payload', () => {
    claiming(() => false);

    const committed = committedWith(node => {
      routeProp(node, 'accessibilityLabel', 'declined');
    });

    expect(committed.payload.accessibilityLabel).toBe('declined');
  });

  it('is never offered the style and class slots', () => {
    const claim = vi.fn(() => false);
    claiming(claim);

    committedWith(node => {
      routeProp(node, 'style', { opacity: 0.5 });
      routeProp(node, 'className', 'card');
    });

    expect(claim).not.toHaveBeenCalled();
  });

  it('stops taking props once released', () => {
    const release = registerPropClaim(
      (_node, key) => key === 'accessibilityLabel',
    );
    release();

    const committed = committedWith(node => {
      routeProp(node, 'accessibilityLabel', 'back');
    });

    expect(committed.payload.accessibilityLabel).toBe('back');
  });
});

describe('several registered prop claims', () => {
  it('offers a prop to the next claim when the first declines it', () => {
    claiming(() => false);
    claiming((_node, key) => key === 'accessibilityLabel');

    const committed = committedWith(node => {
      routeProp(node, 'accessibilityLabel', 'taken by the second');
    });

    expect(Object.hasOwn(committed.payload, 'accessibilityLabel')).toBe(false);
  });

  it('stops asking once one claim has taken the prop', () => {
    const later = vi.fn(() => true);
    claiming(() => true);
    claiming(later);

    committedWith(node => {
      routeProp(node, 'accessibilityLabel', 'value');
    });

    expect(later).not.toHaveBeenCalled();
  });

  it('releases only its own claim', () => {
    const releaseFirst = registerPropClaim(() => false);
    claiming((_node, key) => key === 'accessibilityLabel');
    releaseFirst();
    releaseFirst();

    const committed = committedWith(node => {
      routeProp(node, 'accessibilityLabel', 'still taken');
    });

    expect(Object.hasOwn(committed.payload, 'accessibilityLabel')).toBe(false);
  });
});

describe('a claim on an event-shaped prop', () => {
  it('keeps the function out of the payload and out of the listeners', () => {
    claiming((_node, key) => key === 'onAnimationEnd');
    const handler = vi.fn();

    const committed = committedWith(node => {
      routeProp(node, 'onAnimationEnd', handler);
    });

    expect(Object.hasOwn(committed.payload, 'onAnimationEnd')).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('a claim and the id alias', () => {
  it('is not offered id or nativeID, which the engine folds itself', () => {
    const claim = vi.fn(() => false);
    claiming(claim);

    const committed = committedWith(node => {
      routeProp(node, 'id', 'abc');
    });

    expect(claim).not.toHaveBeenCalled();
    expect(committed.payload.nativeID).toBe('abc');
  });
});
