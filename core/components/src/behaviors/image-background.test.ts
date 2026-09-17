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
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '../../../test-utils/src/index';
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

const fabric = installRecordingFabric();
// `.payload` throughout, per the header: the behavior's work is a fold on the way into what Fabric
// is handed, and the author's bag is deliberately not where it lands.
const live = createLiveTree(fabric);
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
  currentHost = node;
  return surface;
}

let currentHost: ISymbioteNode | undefined;

// The committed host, and the image the behavior built under it. Asserting both view names is what
// makes this a claim about this primitive's shape rather than "the first RCTView in the tree".
//
// Read from THIS case's own host node, never from an app-root lookup: every case opens a fresh
// surface and the recording is never reset between them, so a root lookup would answer with the
// FIRST case's tree for every case after it — green on case one and quietly wrong after.
function subtree(): { host: ILiveNode; image: ILiveNode } {
  if (currentHost === undefined) throw new Error('nothing was mounted');
  const host = live.nodeOf(currentHost);
  expect(host.viewName).toBe(IMAGE_BACKGROUND_VIEW_NAME);
  const image = host.children[0];
  expect(image.viewName).toBe(IMAGE_VIEW_NAME);
  return { host, image };
}

function countNodes(node: ILiveNode): number {
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
    // the box. WHERE each name LANDS is this file's subject; what the image rule then makes of
    // `alt` and `source` is `foldImageProps`'s, asserted in
    // `core/engine/cpp/tests/js/image-payload.itest.ts` — this harness builds its payload through
    // the TypeScript `fabricProps`, which holds no copy of it.
    //
    // `source` IS still the array shape here, and that is not the fold: the three source props are
    // resolved and normalised at WRITE time (`image-source-write.ts`), which this harness does see.
    expect(image.payload.source).toEqual([{ uri: SOURCE.uri }]);
    expect(image.payload.resizeMode).toBe('contain');
    expect(image.payload.testID).toBe('probe');
    expect(image.payload.alt).toBe('A picture');
    expect(host.payload.source).toBeUndefined();
    expect(host.payload.testID).toBeUndefined();
    // The wrapper's own layout box, which is what the app wrote `style` for.
    expect(host.payload.width).toBe(BOX.width);
    expect(host.payload.height).toBe(BOX.height);
  });

  // The Smart Invert opt-out (`ImageBackground.js:75`) left this file on 2026-09-18: it is
  // `foldImageBackgroundProps` in the engine now, and this host builds its payload through the
  // TypeScript `fabricProps`, which carries no copy of the tag rules. Asserted against the committed
  // payload in `core/engine/cpp/tests/js/image-background-payload.itest.ts`. What stays here is the
  // COMPOSITION — which node each prop lands on, and the style the inner image derives from the box.

  // why: WHICH NODE, which is this file's subject: RN spreads `...props` onto the Image, so the
  // name is never the box's. The RENAME is `routeProp`'s since 2026-09-18 — one rule on the way in,
  // over every node — so what the redirect carries down is already `nativeID` and the raw `id`
  // never existed to route. A second case used to sit beside this one asserting the two layers
  // composed; there is one layer now.
  it('puts a bare id on the image, where the spread sends it', () => {
    mount(makeImageBackground({ source: SOURCE, id: 'hero' }));

    const { host, image } = subtree();
    expect(image.payload.nativeID).toBe('hero');
    expect(image.payload.id).toBeUndefined();
    expect(host.payload.nativeID).toBeUndefined();
  });
});

// THE DERIVED STYLE ITSELF LEFT THIS FILE ON 2026-09-18 — the absolute fill, the proxied box, and
// the late re-derive when the owner is resized are all `foldImageBackgroundImageProps` in
// `SymbioteFabricProps.cpp`, asserted against the committed payload in
// `core/engine/cpp/tests/js/image-background-image-payload.itest.ts`.
//
// Five cases went, and the two worth naming are the RE-DERIVE pair, because they are not fold
// content: they pin that a write to the OWNER after the first commit marks the derived image dirty
// (`slotDerived`), which is JS's and stays a real invariant. They moved rather than being deleted —
// their subject is reachable only where the rule runs, and asserting a frozen proxy needs a harness
// that can produce an unfrozen one.
//
// What stays here is the COMPOSITION this primitive owns and no rule can see: which node each prop
// lands on, and that `imageStyle` reaches the image's own style slot.
describe('the ImageBackground behavior — the image style it derives', () => {
  it('merges imageStyle last, so a caller overrides the absolute fill', () => {
    mount(
      makeImageBackground({
        source: SOURCE,
        style: BOX,
        imageStyle: { opacity: 0.25, top: 8 },
      }),
    );

    const { host, image } = subtree();
    expect(image.payload.opacity).toBe(0.25);
    expect(image.payload.top).toBe(8);
    // It targets the image ALONE; a caller styling the background must not repaint the box.
    expect(host.payload.opacity).toBeUndefined();
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
    expect(image.payload.opacity).toBe(0.5);
    expect(host.payload.opacity).toBeUndefined();
  });
});
