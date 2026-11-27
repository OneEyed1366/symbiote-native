// A bare tag `<view testID="x">` must commit what the `p={{…}}` bag commits
// The parity row is the point of the file, and the rest say which half broke
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { registerRules, type ISymbioteNode } from '@symbiote-native/engine';
import { writeHostStyle } from './element-props';
import { createRendererHarness } from './renderer-harness';
import renderer from './symbiote-renderer';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const harness = createRendererHarness(91_407);

beforeEach(() => {
  fabric.reset();
  harness.open();
});

afterEach(() => {
  harness.close();
});

function viewTagged(testID: string): ISymbioteNode {
  const element = renderer.createElement('view');
  renderer.setAttribute(element, 'testID', testID);
  return element;
}

// The live tree, as `find()` of the recording reports the node as it was created
function committedPropsOf(testID: string): Record<string, unknown> {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit.payload;
}

async function mount(element: ISymbioteNode): Promise<void> {
  renderer.insert(harness.liveRoot(), element, null);
  await harness.settle();
}

describe('a bare intrinsic tag', () => {
  // Attributes are written before the element joins the live tree, which is the create path
  it('commits attributes written before it is live', async () => {
    const element = viewTagged('bare');
    renderer.setAttribute(element, 'accessibilityLabel', 'hello');
    await mount(element);

    expect(committedPropsOf('bare').accessibilityLabel).toBe('hello');
  });

  it('commits an attribute written after it is live', async () => {
    const element = viewTagged('bare');
    await mount(element);

    renderer.setAttribute(element, 'accessibilityLabel', 'later');
    await harness.settle();
    expect(committedPropsOf('bare').accessibilityLabel).toBe('later');
  });

  // The reset half: a conditional attribute that stops being emitted must reach Fabric as a reset
  it('resets a removed attribute', async () => {
    const element = viewTagged('bare');
    renderer.setAttribute(element, 'accessibilityLabel', 'before');
    await mount(element);

    renderer.removeAttribute(element, 'accessibilityLabel');
    await harness.settle();
    expect(committedPropsOf('bare').accessibilityLabel ?? null).toBeNull();
  });

  // Svelte hands `style` over `set_style`, whose value reaches the node through the style seam
  it('routes an object style without stringifying it', async () => {
    const element = viewTagged('bare');
    writeHostStyle(element, { width: 12 });
    await mount(element);

    expect(committedPropsOf('bare').width).toBe(12);
  });

  // A bare tag has no wrapper to fold `id` into `nativeID`, and a raw `id` is dropped by Fabric
  it('applies the primitive fold', async () => {
    const element = viewTagged('bare');
    renderer.setAttribute(element, 'id', 'ident');
    await mount(element);

    const props = committedPropsOf('bare');
    expect(props.nativeID).toBe('ident');
    expect(props.id).toBeUndefined();
  });

  // `<view accessible>` arrives as "", the shorthand for true, and Android threw on the string
  it('reads a bare boolean attribute as true', async () => {
    const element = viewTagged('bare');
    renderer.setAttribute(element, 'accessible', '');
    await mount(element);

    expect(committedPropsOf('bare').accessible).toBe(true);
  });

  // A string prop's "" is a real value, not the shorthand
  it('keeps an empty string on a string prop', async () => {
    const element = viewTagged('bare');
    renderer.setAttribute(element, 'accessibilityLabel', '');
    await mount(element);

    expect(committedPropsOf('bare').accessibilityLabel).toBe('');
  });
});

describe('a bare tag and the prop bag', () => {
  // The contract row: the bag spelling is an optimisation, not the only way to reach the engine
  it('commit the same payload for the same props', async () => {
    const props: Record<string, unknown> = {
      accessibilityLabel: 'hello',
      id: 'ident',
    };

    const bare = viewTagged('bare');
    for (const [name, value] of Object.entries(props))
      renderer.setAttribute(bare, name, value);
    writeHostStyle(bare, { width: 12 });
    await mount(bare);

    const bagged = renderer.createElement('view');
    renderer.setAttribute(bagged, 'p', {
      testID: 'bagged',
      ...props,
      style: { width: 12 },
    });
    await mount(bagged);

    const { testID: _bareId, ...bareProps } = committedPropsOf('bare');
    const { testID: _bagId, ...bagProps } = committedPropsOf('bagged');
    expect(bareProps).toEqual(bagProps);
    // Two empty objects would pass the line above, so this says both arms committed
    expect(Object.keys(bareProps).length).toBeGreaterThan(2);
  });
});

// One element, two doors, as an app writes it: `<view p={handlers} class="xy-box" />`
// The `class` is set first and `p` follows, so `p` replacing the whole bag would delete the class
describe('a tag written through two doors at once', () => {
  it('keeps an attribute written before the bag', async () => {
    const element = viewTagged('mixed');
    renderer.setAttribute(element, 'accessibilityLabel', 'from the template');
    renderer.setAttribute(element, 'p', { onPress: () => {} });
    await mount(element);

    expect(committedPropsOf('mixed').accessibilityLabel).toBe(
      'from the template',
    );
  });

  it('keeps an attribute written after the bag', async () => {
    const element = renderer.createElement('view');
    renderer.setAttribute(element, 'p', { testID: 'mixed' });
    writeHostStyle(element, { width: 12 });
    await mount(element);

    expect(committedPropsOf('mixed').width).toBe(12);
  });

  // The device shape end to end, where losing `class` costs every declaration of its rule
  it('resolves a class the template wrote, past a later bag', async () => {
    registerRules([
      {
        tokens: ['xy-box'],
        specificity: [0, 1, 0],
        order: 0,
        style: { width: 36, height: 36 },
      },
    ]);
    const element = viewTagged('mixed');
    renderer.setAttribute(element, 'class', 'xy-box');
    renderer.setAttribute(element, 'p', {
      accessibilityLabel: 'the bag arrived',
    });
    await mount(element);

    const props = committedPropsOf('mixed');
    expect(props.width).toBe(36);
    expect(props.height).toBe(36);
    // The control: a bag that never landed would pass the two lines above
    expect(props.accessibilityLabel).toBe('the bag arrived');
  });

  // `p` still owns its key set, or a conditional prop could never be cleared
  it('still drops a key the bag stops carrying', async () => {
    const element = viewTagged('mixed');
    renderer.setAttribute(element, 'p', { accessibilityLabel: 'first' });
    await mount(element);

    renderer.setAttribute(element, 'p', {});
    await harness.settle();
    expect(committedPropsOf('mixed').accessibilityLabel ?? null).toBeNull();
  });

  // Fixed precedence, as svelte decides the setter order and the app cannot
  it('lets the attribute win over the same name in the bag', async () => {
    const element = viewTagged('mixed');
    renderer.setAttribute(element, 'accessibilityLabel', 'attribute');
    renderer.setAttribute(element, 'p', { accessibilityLabel: 'bag' });
    await mount(element);

    expect(committedPropsOf('mixed').accessibilityLabel).toBe('attribute');
  });
});
