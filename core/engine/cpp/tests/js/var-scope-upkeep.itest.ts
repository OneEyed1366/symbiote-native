// A `var()` follows the tree as it changes: a declaration gained or lost, a reader moved

import {
  appendChild,
  clearGlobalStyles,
  committedPayloadOf,
  createElement,
  createSurface,
  registerRootVariables,
  removeChild,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;
const GREEN = 0xff_00_ff_00;
const BLUE = 0xff_00_00_ff;

function view(style: Record<string, unknown>): ISymbioteNode {
  const node = createElement('RCTView', false);
  setProp(node, 'style', style);
  return node;
}

function mount(root: ISymbioteNode) {
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(root);
  surface.commit();
  mounted();
  return surface;
}

function recommit(surface: ReturnType<typeof mount>): void {
  surface.commit();
  mounted();
}

function paintOf(node: ISymbioteNode): unknown {
  return committedPayloadOf(node)?.backgroundColor;
}

const reader = () => view({ backgroundColor: 'var(--accent)' });

describe('a var() while the declaring scopes change, in the real engine', () => {
  it('reads from a middle node that starts declaring after the first commit', () => {
    clearGlobalStyles();
    const outer = view({ '--accent': '#00ff00' });
    const middle = view({ margin: 1 });
    const leaf = reader();
    appendChild(outer, middle);
    appendChild(middle, leaf);
    const surface = mount(outer);
    expect(paintOf(leaf)).toBe(GREEN);

    setProp(middle, 'style', { '--accent': '#0000ff' });
    recommit(surface);

    expect(paintOf(leaf)).toBe(BLUE);
  });

  it('falls back to the outer declaration when the middle node stops declaring', () => {
    clearGlobalStyles();
    const outer = view({ '--accent': '#00ff00' });
    const middle = view({ '--accent': '#0000ff' });
    const leaf = reader();
    appendChild(outer, middle);
    appendChild(middle, leaf);
    const surface = mount(outer);
    expect(paintOf(leaf)).toBe(BLUE);

    setProp(middle, 'style', { margin: 1 });
    recommit(surface);

    expect(paintOf(leaf)).toBe(GREEN);
  });

  it('repaints a reader moved under a parent with another declaration', () => {
    clearGlobalStyles();
    const root = view({});
    const greenSide = view({ '--accent': '#00ff00' });
    const blueSide = view({ '--accent': '#0000ff' });
    const leaf = reader();
    appendChild(root, greenSide);
    appendChild(root, blueSide);
    appendChild(greenSide, leaf);
    const surface = mount(root);
    expect(paintOf(leaf)).toBe(GREEN);

    removeChild(greenSide, leaf);
    appendChild(blueSide, leaf);
    recommit(surface);

    expect(paintOf(leaf)).toBe(BLUE);
  });

  it('repaints a deep reader when its whole subtree moves', () => {
    clearGlobalStyles();
    const root = view({});
    const greenSide = view({ '--accent': '#00ff00' });
    const blueSide = view({ '--accent': '#0000ff' });
    const branch = view({ margin: 1 });
    const leaf = reader();
    appendChild(root, greenSide);
    appendChild(root, blueSide);
    appendChild(greenSide, branch);
    appendChild(branch, leaf);
    const surface = mount(root);
    expect(paintOf(leaf)).toBe(GREEN);

    removeChild(greenSide, branch);
    appendChild(blueSide, branch);
    recommit(surface);

    expect(paintOf(leaf)).toBe(BLUE);
  });

  it('falls back to :root when the reader leaves its declaring parent', () => {
    clearGlobalStyles();
    registerRootVariables([{ name: '--accent', value: '#0000ff' }]);
    const root = view({});
    const declarer = view({ '--accent': '#00ff00' });
    const leaf = reader();
    appendChild(root, declarer);
    appendChild(declarer, leaf);
    const surface = mount(root);
    expect(paintOf(leaf)).toBe(GREEN);

    removeChild(declarer, leaf);
    appendChild(root, leaf);
    recommit(surface);

    expect(paintOf(leaf)).toBe(BLUE);
  });
});

report();
