import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  createElement,
  createSurface,
  registerStyleClaim,
  routeProp,
} from '../index';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 9_900;

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

// A value that names `:hover` is served by the package, the rest of the style is the host's
function variantsOf(value: unknown): { base: unknown } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (!(':hover' in value)) return undefined;
  return { base: 'default' in value ? value.default : undefined };
}

const releases: Array<() => void> = [];

function claimingVariants(receive = vi.fn()) {
  releases.push(registerStyleClaim({ owns: () => false, variantsOf, receive }));
  return receive;
}

afterEach(() => {
  for (const release of releases.splice(0)) release();
});

describe('a style claim that serves variants of a value', () => {
  it('lets the host paint the base of the value', () => {
    claimingVariants();

    const committed = committedWith(node => {
      routeProp(node, 'style', {
        opacity: { default: 0.5, ':hover': 1 },
        width: 10,
      });
    });

    expect(committed.payload.opacity).toBe(0.5);
    expect(committed.payload.width).toBe(10);
  });

  it('hands the claim the whole value, variants included', () => {
    const receive = claimingVariants();
    const value = { default: 0.5, ':hover': 1 };
    let written: ReturnType<typeof createElement> | undefined;

    committedWith(node => {
      written = node;
      routeProp(node, 'style', { opacity: value });
    });

    expect(receive).toHaveBeenLastCalledWith(written, { opacity: value });
  });

  it('paints nothing for a value that has no base', () => {
    claimingVariants();

    const committed = committedWith(node => {
      routeProp(node, 'style', { opacity: { ':hover': 1 }, width: 10 });
    });

    expect(Object.hasOwn(committed.payload, 'opacity')).toBe(false);
    expect(committed.payload.width).toBe(10);
  });

  it('leaves a value the claim does not serve to the host as it is', () => {
    const receive = claimingVariants();
    let written: ReturnType<typeof createElement> | undefined;

    const committed = committedWith(node => {
      written = node;
      routeProp(node, 'style', { opacity: 0.5 });
    });

    expect(committed.payload.opacity).toBe(0.5);
    expect(receive).toHaveBeenLastCalledWith(written, {});
  });
});
