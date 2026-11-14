// `getComputedVariable` answers what a `var()` on that node would read, as `getPropertyValue` does

import {
  appendChild,
  clearGlobalStyles,
  createElement,
  createSurface,
  getComputedVariable,
  registerRootVariables,
  setProp,
  setVariable,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

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

function fresh(): void {
  clearGlobalStyles();
  setVariable(ROOT_TAG, '--accent', undefined);
}

describe('getComputedVariable, in the real engine', () => {
  it('reads a declaration the node made itself', () => {
    fresh();
    const node = view({ '--accent': '#00ff00' });
    mount(node);

    expect(getComputedVariable(node, '--accent')).toBe('#00ff00');
  });

  it('reads the nearest declaration of an ancestor', () => {
    fresh();
    const outer = view({ '--accent': '#ff0000' });
    const inner = view({ '--accent': '#0000ff' });
    const leaf = view({});
    appendChild(outer, inner);
    appendChild(inner, leaf);
    mount(outer);

    expect(getComputedVariable(leaf, '--accent')).toBe('#0000ff');
  });

  it('falls through the surface to :root', () => {
    fresh();
    registerRootVariables([
      { name: '--accent', value: '#ff0000' },
      { name: '--gap', value: '4px' },
    ]);
    setVariable(ROOT_TAG, '--accent', '#00ff00');
    const node = view({});
    mount(node);

    expect(getComputedVariable(node, '--accent')).toBe('#00ff00');
    expect(getComputedVariable(node, '--gap')).toBe('4px');
  });

  it('answers an empty string for a name nothing declares', () => {
    fresh();
    const node = view({});
    mount(node);

    expect(getComputedVariable(node, '--nothing')).toBe('');
  });

  it('sees a declaration written since the last commit', () => {
    fresh();
    const parent = view({ '--accent': '#00ff00' });
    const child = view({});
    appendChild(parent, child);
    mount(parent);

    setProp(parent, 'style', { '--accent': '#0000ff' });

    expect(getComputedVariable(child, '--accent')).toBe('#0000ff');
  });
});

report();
