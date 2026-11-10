// A `--x` in a node's style is visible to that node and its descendants, the nearest one winning

import {
  appendChild,
  clearGlobalStyles,
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  registerRootVariables,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { recordSetProp } from '../../../src/mutation-buffer';

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

function paintOf(node: ISymbioteNode): unknown {
  return committedPayloadOf(node)?.backgroundColor;
}

describe('a var() against declarations on the node chain, in the real engine', () => {
  it('reads a declaration from the parent', () => {
    clearGlobalStyles();
    const parent = view({ '--accent': '#00ff00' });
    const child = view({ backgroundColor: 'var(--accent)' });
    appendChild(parent, child);
    mount(parent);

    expect(paintOf(child)).toBe(0xff_00_ff_00);
  });

  it('reads a declaration the node made itself', () => {
    clearGlobalStyles();
    const node = view({ '--accent': '#0000ff', backgroundColor: 'var(--accent)' });
    mount(node);

    expect(paintOf(node)).toBe(0xff_00_00_ff);
  });

  it('takes the nearest declaring ancestor over a farther one and over :root', () => {
    clearGlobalStyles();
    registerRootVariables([{ name: '--accent', value: '#00ff00' }]);
    const outer = view({ '--accent': '#ff0000' });
    const inner = view({ '--accent': '#0000ff' });
    const leaf = view({ backgroundColor: 'var(--accent)' });
    appendChild(outer, inner);
    appendChild(inner, leaf);
    mount(outer);

    expect(paintOf(leaf)).toBe(0xff_00_00_ff);
  });

  it('falls back to :root when no ancestor declares the name', () => {
    clearGlobalStyles();
    registerRootVariables([{ name: '--accent', value: '#00ff00' }]);
    const parent = view({ '--other': '#ff0000' });
    const child = view({ backgroundColor: 'var(--accent)' });
    appendChild(parent, child);
    mount(parent);

    expect(paintOf(child)).toBe(0xff_00_ff_00);
  });

  it('resolves a reference inside a declaration where that declaration sits', () => {
    clearGlobalStyles();
    const outer = view({ '--accent': 'var(--tone)', '--tone': '#00ff00' });
    const inner = view({ '--tone': '#0000ff' });
    const leaf = view({ backgroundColor: 'var(--accent)' });
    appendChild(outer, inner);
    appendChild(inner, leaf);
    mount(outer);

    expect(paintOf(leaf)).toBe(0xff_00_ff_00);
  });

  it('keeps the declaration out of the payload', () => {
    clearGlobalStyles();
    const node = view({ '--accent': '#00ff00', margin: 2 });
    mount(node);

    const payload = committedPayloadOf(node);
    expect(payload?.margin).toBe(2);
    expect(payload !== undefined && '--accent' in payload).toBe(false);
  });

  it('repaints the readers below when the declaration changes, and only them', () => {
    clearGlobalStyles();
    const parent = view({ '--accent': '#00ff00' });
    const reader = view({ backgroundColor: 'var(--accent)' });
    const bystander = view({ margin: 3 });
    appendChild(parent, reader);
    appendChild(parent, bystander);
    const surface = mount(parent);
    expect(paintOf(reader)).toBe(0xff_00_ff_00);
    readSurfaceTelemetry(ROOT_TAG);

    setProp(parent, 'style', { '--accent': '#0000ff' });
    surface.commit();
    mounted();

    expect(paintOf(reader)).toBe(0xff_00_00_ff);
    expect(readSurfaceTelemetry(ROOT_TAG)?.nodesCloned).toBe(3);
  });
});

describe('the scan flag of a style write, in the real engine', () => {
  it('scans no style the host was not told declares a variable', () => {
    clearGlobalStyles();
    const parent = createElement('RCTView', false);
    recordSetProp(parent, 'style', { '--accent': '#00ff00' });
    const child = view({ backgroundColor: 'var(--accent)' });
    appendChild(parent, child);
    mount(parent);

    expect(paintOf(child)).toBe(undefined);
  });

  it('scans a flagged style again after it stopped declaring', () => {
    clearGlobalStyles();
    const parent = view({ '--accent': '#00ff00' });
    const child = view({ backgroundColor: 'var(--accent)' });
    appendChild(parent, child);
    const surface = mount(parent);
    expect(paintOf(child)).toBe(0xff_00_ff_00);

    setProp(parent, 'style', { margin: 1 });
    surface.commit();
    mounted();

    expect(paintOf(child)).toBe(undefined);
  });
});

report();
