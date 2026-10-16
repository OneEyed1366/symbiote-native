import {
  createElement,
  createSurface,
  routeProp,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from 'react-native-reanimated/src/common';
import { FadeIn } from 'react-native-reanimated';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { claimLayoutAnimationProps } from './layout-animations';

vi.mock('react-native-reanimated/src/UpdateLayoutAnimations', () => ({
  updateLayoutAnimations: vi.fn(),
}));

installWrapperHost();
let nextRootTag = 21_000;
const releases: Array<() => void> = [];
const warn = vi.spyOn(logger, 'warn');

beforeEach(() => {
  warn.mockReset();
  releases.push(claimLayoutAnimationProps());
});

afterEach(() => {
  for (const release of releases.splice(0)) release();
});

function committed(write: (node: ReturnType<typeof createElement>) => void) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  write(node);
  surface.appendChild(node);
  surface.commit();
  return { surface, node };
}

const plain = () => ({
  animations: {},
  initialValues: {},
  callback: undefined,
});

describe('an animation that animates a property the style also sets', () => {
  it.each(['entering', 'exiting'] as const)(
    'is warned about for %s, naming the property',
    key => {
      committed(node => {
        routeProp(node, 'style', { opacity: 0.5, width: 10 });
        routeProp(node, key, FadeIn);
      });

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toMatch(/"opacity".*overwritten/);
    },
  );

  it('is warned about when the style comes after the animation', () => {
    committed(node => {
      routeProp(node, 'entering', FadeIn);
      routeProp(node, 'style', [{ width: 10 }, { opacity: 0.5 }]);
    });

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is warned about once for a node, however often it renders', () => {
    const { surface, node } = committed(target => {
      routeProp(target, 'style', { opacity: 0.5 });
      routeProp(target, 'entering', FadeIn);
    });

    routeProp(node, 'style', { opacity: 0.4 });
    routeProp(node, 'entering', FadeIn);
    surface.commit();

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('an animation that leaves the style alone', () => {
  it('is not warned about when no property is shared', () => {
    committed(node => {
      routeProp(node, 'style', { width: 10 });
      routeProp(node, 'entering', FadeIn);
    });

    expect(warn).not.toHaveBeenCalled();
  });

  it('is not warned about when it is a layout animation', () => {
    committed(node => {
      routeProp(node, 'style', { opacity: 0.5 });
      routeProp(node, 'layout', FadeIn);
    });

    expect(warn).not.toHaveBeenCalled();
  });

  it('is not warned about when it is a plain function, which says nothing before it runs', () => {
    committed(node => {
      routeProp(node, 'style', { opacity: 0.5 });
      routeProp(node, 'entering', plain);
    });

    expect(warn).not.toHaveBeenCalled();
  });
});
