// ImageBackground as a tag: the subtree the behavior builds, where the app's children land in it,
// and the folds the five wrappers used to run.
//
// EVERY ASSERTION IS ON THE COMMITTED TREE, never `node.props` — the wrapper this replaces was
// judged by what Fabric received, and a fold that overwrites a whole slot is invisible one layer
// up (`.claude/rules/test-harness-false-greens.md`).
//
// THE HOST IS FOUND BY POSITION, not by `testID`, and that is a fact about this primitive rather
// than a shortcut. RN spreads `...props` — `testID` included — onto the inner Image
// (`ImageBackground.js:81`), so a `testID` written on the tag identifies the IMAGE. Every wrapper
// did the same. The internal image has no id of its own, so it is reached through the host one hop
// at a time with every view name asserted, the way `button.test.ts` reaches its label.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '../../../test-utils/src/index';
import {
  appendChild,
  clearGlobalStyles,
  clearHostBehaviors,
  createElement,
  createSurface,
  registerRules,
  removeChild,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  registerImageBackgroundBehavior,
  IMAGE_BACKGROUND_TAG,
} from './image-background';
import { foldHostBag } from '../fold-host-bag';

const fabric = installFabric();
let nextRootTag = 7700;

// The Fabric name an adapter resolves `image-background` to. Built with the NAME and the TAG
// separately, which is what every adapter does — building it with the tag would make the registry
// key match by accident (`host-behavior.ts`, `attached`).
const IMAGE_BACKGROUND_VIEW_NAME = 'RCTView';
const IMAGE_VIEW_NAME = 'RCTImageView';
const TEXT_VIEW_NAME = 'RCTText';

const SOURCE = { uri: 'https://example.test/bg.png' };
const BOX = { width: 100, height: 80 };

beforeEach(() => {
  fabric.reset();
  registerImageBackgroundBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  clearGlobalStyles();
});

function makeImageBackground(
  props: Readonly<Record<string, unknown>> = {},
): ISymbioteNode {
  const node = createElement(
    IMAGE_BACKGROUND_VIEW_NAME,
    false,
    IMAGE_BACKGROUND_TAG,
  );
  for (const key of Object.keys(props)) routeProp(node, key, props[key]);
  return node;
}

// Children are appended to the OWNER, which is what every adapter does — the redirect (or, here,
// the refusal to redirect) is the engine's job and is the thing under test.
function mount(node: ISymbioteNode, children: readonly ISymbioteNode[] = []) {
  for (const child of children) appendChild(node, child);
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

// The committed host, and the image the behavior built under it. Asserting both view names is what
// makes this a claim about this primitive's shape rather than "the first RCTView in the tree".
function subtree(): { host: IFakeNode; image: IFakeNode } {
  const host = fabric.appRoot().children[0];
  expect(host.viewName).toBe(IMAGE_BACKGROUND_VIEW_NAME);
  const image = host.children[0];
  expect(image.viewName).toBe(IMAGE_VIEW_NAME);
  return { host, image };
}

function countNodes(node: IFakeNode): number {
  return 1 + node.children.reduce((sum, kid) => sum + countNodes(kid), 0);
}

describe('the ImageBackground behavior — the subtree it builds', () => {
  it('commits a view holding exactly one image, and nothing else, for a childless tag', () => {
    mount(makeImageBackground({ source: SOURCE, style: BOX }));

    const { host, image } = subtree();
    expect(host.children).toHaveLength(1);
    expect(image.children).toHaveLength(0);
    // Two nodes, not three: no anchor, no spare wrapper. RN's ImageBackground is a View and an
    // Image (`ImageBackground.js:74-101`) and the tag owes the same node count.
    expect(countNodes(host)).toBe(2);
  });

  it("lays the app's children AFTER the image, so they paint over it", () => {
    const node = makeImageBackground({ source: SOURCE, style: BOX });
    const first = createElement(TEXT_VIEW_NAME, false, 'text');
    const second = createElement(IMAGE_BACKGROUND_VIEW_NAME, false, 'view');
    mount(node, [first, second]);

    const { host } = subtree();
    // Order is the whole assertion: an image committed after the content paints over it, which is
    // the visible failure this primitive exists to avoid.
    expect(host.children.map(child => child.viewName)).toEqual([
      IMAGE_VIEW_NAME,
      TEXT_VIEW_NAME,
      IMAGE_BACKGROUND_VIEW_NAME,
    ]);
    expect(countNodes(host)).toBe(4);
  });

  it('keeps a child appended after mount beside the image rather than inside it', () => {
    const node = makeImageBackground({ source: SOURCE, style: BOX });
    const surface = mount(node);

    appendChild(node, createElement(TEXT_VIEW_NAME, false, 'text'));
    surface.commit();

    const { host, image } = subtree();
    expect(host.children.map(child => child.viewName)).toEqual([
      IMAGE_VIEW_NAME,
      TEXT_VIEW_NAME,
    ]);
    expect(image.children).toHaveLength(0);
  });

  it('removes an app child without disturbing the image', () => {
    const node = makeImageBackground({ source: SOURCE, style: BOX });
    const child = createElement(TEXT_VIEW_NAME, false, 'text');
    const surface = mount(node, [child]);
    // Pinned before the removal so this case cannot pass on a tree where the child was never a
    // sibling in the first place — the removal would then "succeed" out of the image.
    expect(subtree().host.children.map(kid => kid.viewName)).toEqual([
      IMAGE_VIEW_NAME,
      TEXT_VIEW_NAME,
    ]);

    // The adapter removes from the node it appended to — the OWNER. A redirect into the image here
    // would miss, the splice would no-op, and the child would stay committed forever.
    removeChild(node, child);
    surface.commit();

    const { host } = subtree();
    expect(host.children.map(kid => kid.viewName)).toEqual([IMAGE_VIEW_NAME]);
  });
});

describe('the ImageBackground behavior — where a prop lands', () => {
  it('routes every image prop onto the image and keeps style on the host', () => {
    mount(
      makeImageBackground({
        source: SOURCE,
        resizeMode: 'contain',
        testID: 'probe',
        alt: 'A picture',
        style: BOX,
      }),
    );

    const { host, image } = subtree();
    // RN spreads `...props` onto the Image (`ImageBackground.js:81`), so none of these belong to
    // the box — and the shared mapping is what turns `alt` into an accessibility label.
    expect(image.props.source).toEqual([{ uri: SOURCE.uri }]);
    expect(image.props.resizeMode).toBe('contain');
    expect(image.props.testID).toBe('probe');
    expect(image.props.accessibilityLabel).toBe('A picture');
    expect(image.props.alt).toBeUndefined();
    expect(host.props.source).toBeUndefined();
    expect(host.props.testID).toBeUndefined();
    // The wrapper's own layout box, which is what the app wrote `style` for.
    expect(host.props.width).toBe(BOX.width);
    expect(host.props.height).toBe(BOX.height);
  });

  it('opts the box out of colour inversion, which no wrapper ever did', () => {
    mount(makeImageBackground({ source: SOURCE }));
    // `ImageBackground.js:75` sets it unconditionally; a photograph inverted by Smart Invert is the
    // case it exists for.
    expect(subtree().host.props.accessibilityIgnoresInvertColors).toBe(true);
  });

  it('folds id to nativeID on the image, where the spread puts it', () => {
    mount(makeImageBackground({ source: SOURCE, id: 'hero' }));

    const { host, image } = subtree();
    expect(image.props.nativeID).toBe('hero');
    // A raw `id` is a key no ViewConfig declares: Fabric drops it silently, so the fold is the only
    // thing standing between the app and a lost nativeID.
    expect(image.props.id).toBeUndefined();
    expect(host.props.nativeID).toBeUndefined();
  });

  it('composes with the spec alias an adapter already applied, rather than double-folding', () => {
    // `HOST_PRIMITIVES.ImageBackground` carries `ID_ALIAS`, so every adapter that runs
    // `foldHostBag` hands the owner a bag where `id` is already `nativeID`. Measured rather than
    // reasoned: the alias DELETES its source key, so the behavior's own fold finds nothing left and
    // both arms commit the same payload.
    const folded = foldHostBag(IMAGE_BACKGROUND_TAG, { id: 'hero' });
    expect(Object.keys(folded)).toEqual(['nativeID']);
    mount(makeImageBackground({ source: SOURCE, ...folded }));

    const { image } = subtree();
    expect(image.props.nativeID).toBe('hero');
    expect(image.props.id).toBeUndefined();
  });
});

describe('the ImageBackground behavior — the image style it derives', () => {
  it('fills the box absolutely and proxies the wrapper dimensions onto the image', () => {
    mount(makeImageBackground({ source: SOURCE, style: BOX }));

    const { image } = subtree();
    expect(image.props.position).toBe('absolute');
    expect(image.props.top).toBe(0);
    expect(image.props.left).toBe(0);
    expect(image.props.right).toBe(0);
    expect(image.props.bottom).toBe(0);
    // Without the proxy an RN Image collapses to its source's intrinsic size and fights the box —
    // the reason RN carries the workaround at `ImageBackground.js:86-96`.
    expect(image.props.width).toBe(BOX.width);
    expect(image.props.height).toBe(BOX.height);
  });

  it('leaves the image dimension unset when the box never set an explicit one', () => {
    mount(makeImageBackground({ source: SOURCE }));

    const { image } = subtree();
    // The proxy exists ONLY to counter an explicit box dimension. On an auto-sized box, forcing a
    // numeric 0 onto the image would shrink it instead of letting it size from the source.
    expect(image.props.position).toBe('absolute');
    expect(image.props.width).toBeUndefined();
    expect(image.props.height).toBeUndefined();
  });

  it('merges imageStyle last, so a caller overrides the absolute fill', () => {
    mount(
      makeImageBackground({
        source: SOURCE,
        style: BOX,
        imageStyle: { opacity: 0.25, top: 8 },
      }),
    );

    const { host, image } = subtree();
    expect(image.props.opacity).toBe(0.25);
    expect(image.props.top).toBe(8);
    // It targets the image ALONE; a caller styling the background must not repaint the box.
    expect(host.props.opacity).toBeUndefined();
  });

  it('resolves imageStyle given as a class name, through the shared registry', () => {
    registerRules([
      {
        tokens: ['overlay'],
        specificity: [0, 1, 0],
        order: 0,
        style: { opacity: 0.5 },
      },
    ]);
    mount(
      makeImageBackground({
        source: SOURCE,
        style: BOX,
        imageStyle: 'overlay',
      }),
    );

    const { host, image } = subtree();
    expect(image.props.opacity).toBe(0.5);
    expect(host.props.opacity).toBeUndefined();
  });

  it("re-derives the image when the wrapper's style changes after mount", () => {
    const node = makeImageBackground({ source: SOURCE, style: BOX });
    const surface = mount(node);
    expect(subtree().image.props.width).toBe(BOX.width);

    routeProp(node, 'style', { width: 200, height: 160 });
    surface.commit();

    const { host, image } = subtree();
    expect(host.props.width).toBe(200);
    // The freeze this primitive's `slotDerived` exists to prevent: `markPropsDirty` bubbles UP, so
    // an owner write reaches every ancestor and never the built image, and `reconcile` hands back
    // an untouched subtree's committed handle.
    expect(image.props.width).toBe(200);
    expect(image.props.height).toBe(160);
  });

  it('re-derives the image when the box is sized by a CLASS instead of a style object', () => {
    registerRules([
      {
        tokens: ['box'],
        specificity: [0, 1, 0],
        order: 0,
        style: { width: 300, height: 240 },
      },
    ]);
    const node = makeImageBackground({ source: SOURCE });
    const surface = mount(node);
    expect(subtree().image.props.width).toBeUndefined();

    // A class name is published INTO `node.props.style` by `pushClassStyle`, so it reaches the
    // derived-slot mark spelled `style` — which is why `slotDerived` names only that one key.
    routeProp(node, 'class', 'box');
    surface.commit();

    const { host, image } = subtree();
    expect(host.props.width).toBe(300);
    expect(image.props.width).toBe(300);
    expect(image.props.height).toBe(240);
  });
});
