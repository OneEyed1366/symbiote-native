// A node answering to a container gets the style of the container's size in its FIRST commit
// The harness sends no layout event, so only the C++ commit hook can supply it

import {
  appendChild,
  clearGlobalStyles,
  committedPayloadOf,
  createElement,
  createSurface,
  registerRules,
  routeProp,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;
const WIDE = 500;
const NARROW = 300;

function box(style: Record<string, unknown>): ISymbioteNode {
  const node = createElement('RCTView', false);
  routeProp(node, 'style', style);
  return node;
}

function card(): ISymbioteNode {
  const node = createElement('RCTView', false);
  routeProp(node, 'class', 'card');
  return node;
}

function mount(root: ISymbioteNode): ReturnType<typeof createSurface> {
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(root);
  surface.commit();
  mounted();
  return surface;
}

function registerCardRules(): void {
  clearGlobalStyles();
  registerRules(
    [
      { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: 4 } },
      { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: 16 }, cond: 0 },
    ],
    [['@', null, ['>=', 'width', 400]]],
  );
}

function registerNamedRules(): void {
  clearGlobalStyles();
  registerRules(
    [
      { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: 4 } },
      { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: 16 }, cond: 0 },
    ],
    [['@', 'side', ['>=', 'width', 400]]],
  );
}

describe('the first commit of a node answering to a container', () => {
  it('asks the container that carries the name, not the nearest one', () => {
    registerNamedRules();
    const outer = box({ width: NARROW, height: 200, containerType: 'size' });
    const named = box({ width: WIDE, height: 80, containerType: 'size', containerName: 'side' });
    const nearest = box({ width: NARROW, height: 40, containerType: 'size' });
    const child = card();
    appendChild(nearest, child);
    appendChild(named, nearest);
    appendChild(outer, named);

    mount(outer);

    expect(committedPayloadOf(child)?.padding).toBe(16);
  });

  it('keeps the plain style when no container is above the node', () => {
    registerCardRules();
    const parent = box({ width: WIDE, height: 80 });
    const child = card();
    appendChild(parent, child);

    mount(parent);

    expect(committedPayloadOf(child)?.padding).toBe(4);
  });

  it('lets an explicit style of the node win over the variant', () => {
    registerCardRules();
    const container = box({ width: WIDE, height: 80, containerType: 'size' });
    const child = card();
    routeProp(child, 'style', { padding: 2 });
    appendChild(container, child);

    mount(container);

    expect(committedPayloadOf(child)?.padding).toBe(2);
  });

  it('holds the variant through a later commit that changes another prop', () => {
    registerCardRules();
    const container = box({ width: WIDE, height: 80, containerType: 'size' });
    const child = card();
    appendChild(container, child);
    const surface = mount(container);

    setProp(child, 'opacity', 0.5);
    surface.commit();
    mounted();

    expect(committedPayloadOf(child)?.padding).toBe(16);
    expect(committedPayloadOf(child)?.opacity).toBe(0.5);
  });

  it('takes the container rule when the container lays out wide enough', () => {
    registerCardRules();
    const container = box({ width: WIDE, height: 80, containerType: 'size' });
    const child = card();
    appendChild(container, child);

    mount(container);

    expect(committedPayloadOf(child)?.padding).toBe(16);
  });

  it('keeps the plain style when the container lays out narrow', () => {
    registerCardRules();
    const container = box({ width: NARROW, height: 80, containerType: 'size' });
    const child = card();
    appendChild(container, child);

    mount(container);

    expect(committedPayloadOf(child)?.padding).toBe(4);
  });
});

report();
