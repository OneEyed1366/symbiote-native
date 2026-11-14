// A variable written on a surface sits between the node chain and the `:root` table

import {
  appendChild,
  clearGlobalStyles,
  committedPayloadOf,
  createElement,
  createSurface,
  registerRootVariables,
  setProp,
  setVariable,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;
const OTHER_TAG = 11;
const GREEN = 0xff_00_ff_00;
const BLUE = 0xff_00_00_ff;
const RED = 0xff_ff_00_00;

function view(style: Record<string, unknown>): ISymbioteNode {
  const node = createElement('RCTView', false);
  setProp(node, 'style', style);
  return node;
}

function mountOn(tag: number, root: ISymbioteNode) {
  const surface = createSurface(tag);
  surface.appendChild(root);
  surface.commit();
  mounted();
  return surface;
}

function recommit(surface: ReturnType<typeof mountOn>): void {
  surface.commit();
  mounted();
}

function paintOf(node: ISymbioteNode): unknown {
  return committedPayloadOf(node)?.backgroundColor;
}

const reader = () => view({ backgroundColor: 'var(--accent)' });

// The surface tables outlive a test, so each one empties the name it uses
function fresh(): void {
  clearGlobalStyles();
  setVariable(ROOT_TAG, '--accent', undefined);
  setVariable(OTHER_TAG, '--accent', undefined);
}

describe('a var() against a variable written on the surface, in the real engine', () => {
  it('paints a node from a surface variable written before the first commit', () => {
    fresh();
    setVariable(ROOT_TAG, '--accent', '#00ff00');
    const leaf = reader();
    mountOn(ROOT_TAG, leaf);

    expect(paintOf(leaf)).toBe(GREEN);
  });

  it('takes a node declaration over the surface, and the surface over :root', () => {
    fresh();
    registerRootVariables([{ name: '--accent', value: '#ff0000' }]);
    setVariable(ROOT_TAG, '--accent', '#00ff00');
    const declarer = view({ '--accent': '#0000ff' });
    const inner = reader();
    const outer = reader();
    appendChild(declarer, inner);
    const root = view({});
    appendChild(root, declarer);
    appendChild(root, outer);
    mountOn(ROOT_TAG, root);

    expect(paintOf(inner)).toBe(BLUE);
    expect(paintOf(outer)).toBe(GREEN);
  });

  it('repaints the readers when the variable changes after the first commit', () => {
    fresh();
    setVariable(ROOT_TAG, '--accent', '#00ff00');
    const leaf = reader();
    const surface = mountOn(ROOT_TAG, leaf);

    setVariable(ROOT_TAG, '--accent', '#0000ff');
    recommit(surface);

    expect(paintOf(leaf)).toBe(BLUE);
  });

  it('falls back to :root when the surface variable is removed', () => {
    fresh();
    registerRootVariables([{ name: '--accent', value: '#ff0000' }]);
    setVariable(ROOT_TAG, '--accent', '#00ff00');
    const leaf = reader();
    const surface = mountOn(ROOT_TAG, leaf);
    expect(paintOf(leaf)).toBe(GREEN);

    setVariable(ROOT_TAG, '--accent', undefined);
    recommit(surface);

    expect(paintOf(leaf)).toBe(RED);
  });

  it('leaves a node on another surface alone', () => {
    fresh();
    const mine = reader();
    const theirs = reader();
    const mineSurface = mountOn(ROOT_TAG, mine);
    const theirSurface = mountOn(OTHER_TAG, theirs);

    setVariable(ROOT_TAG, '--accent', '#00ff00');
    recommit(mineSurface);
    recommit(theirSurface);

    expect(paintOf(mine)).toBe(GREEN);
    expect(paintOf(theirs)).toBe(undefined);
  });
});

report();
