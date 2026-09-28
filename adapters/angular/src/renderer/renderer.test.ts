// Co-located headless test for the Angular renderer seam. Drives SymbioteRenderer
// directly — no Angular runtime, no compiler — against the shared fake Fabric slot, proving
// each Renderer2 method maps onto the engine mutation API and commits a correct Fabric tree.
// The bootstrap (mount → createComponent) is validated separately on a real host / the AOT
// example; this isolates the seam, which is the deterministic, framework-free half.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  createSurface,
  disposeRoot,
  isAnchor,
  isSymbioteNode,
  registerRules,
} from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { SymbioteRenderer, SymbioteRendererFactory } from './index';
import { registerComposedComponent } from '../anchor-host-registry';

const ROOT_TAG = 707;
const PROBE_ID = 'probe';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// A macrotask boundary drains the engine's coalesced (requestCommit) commit before asserting.
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// The LIVE tree, not the record's `find` — `find` searches the CREATION log, which never
// forgets a node once it exists, so a residency question ("is it still there") phrased against
// it would pass forever whatever removeChild actually did. Every test in this file calls
// `setup()` exactly once and `fabric.reset()` runs in `beforeEach`, so `live.appRoot()` is safe
// (`.docs/mirror-elimination.md`, "`appRoot()` is only safe in a file that mounts once per case
// AND resets the recording between cases").
function findCommitted(
  predicate: (node: ReturnType<typeof live.nodeOf>) => boolean,
) {
  return live.findLive(live.appRoot(), predicate);
}

function serializedApp(): string {
  return live
    .nodeOf(live.appRoot())
    .children.map(child => live.serialize(child.handle))
    .join('');
}

function setup(): {
  surface: ReturnType<typeof createSurface>;
  renderer: SymbioteRenderer;
} {
  const surface = createSurface(ROOT_TAG);
  const renderer = new SymbioteRendererFactory(surface).createRenderer(
    null,
    null,
  );
  if (!(renderer instanceof SymbioteRenderer))
    throw new Error('unreachable: factory built the renderer');
  return { surface, renderer };
}

beforeEach(() => fabric.reset());
afterEach(() => {
  disposeRoot(ROOT_TAG);
  clearGlobalStyles();
});

describe('Angular SymbioteRenderer drives the engine', () => {
  // why: `View`/`Text` are the public ergonomic selectors apps can author directly (as opposed
  // to the internal `view`/`text` primitive names) — PRIMITIVE_SELECTOR_ALIAS
  // must resolve BOTH spellings to the identical engine descriptor, or an app using the
  // ergonomic name would silently get a different (or missing) primitive than one using the
  // internal name.
  it('resolves the public View/Text aliases to the same primitives as their symbiote-* names', async () => {
    const { surface, renderer } = setup();
    const aliasedView = renderer.createElement('View');
    renderer.setProperty(aliasedView, 'testID', 'aliased-view');
    const directView = renderer.createElement('view');
    renderer.setProperty(directView, 'testID', 'direct-view');
    renderer.appendChild(surface, aliasedView);
    renderer.appendChild(surface, directView);
    await tick();

    const aliased = fabric.find(node => node.props.testID === 'aliased-view');
    const direct = fabric.find(node => node.props.testID === 'direct-view');
    expect(aliased?.viewName).toBe(direct?.viewName);
  });

  it('maps createElement / createText / appendChild into a committed Fabric tree', async () => {
    const { surface, renderer } = setup();
    const view = renderer.createElement('view');
    const text = renderer.createElement('text');
    const raw = renderer.createText('Hello');
    renderer.appendChild(text, raw);
    renderer.appendChild(view, text);
    renderer.appendChild(surface, view);
    await tick();

    // The engine wraps surface.children in the synthetic box-none AppContainer root.
    expect(serializedApp()).toBe('RCTView(RCTText(RCTRawText "Hello"))');
  });

  // why: descriptorFor's table is shared across every adapter — a symbiote intrinsic beyond
  // View/Text (ActivityIndicator, Image) must resolve to the SAME native viewName React/Vue get,
  // proving the Angular renderer doesn't hand-roll its own descriptor mapping.
  it('maps additional symbiote intrinsics through the shared descriptor table', async () => {
    const { surface, renderer } = setup();
    const spinner = renderer.createElement('activity-indicator-spinner');
    renderer.setProperty(spinner, 'testID', 'spinner');
    renderer.setProperty(spinner, 'animating', true);
    const image = renderer.createElement('image');
    renderer.setProperty(image, 'testID', 'image');
    renderer.setProperty(image, 'source', {
      uri: 'https://example.invalid/image.png',
    });
    renderer.appendChild(surface, spinner);
    renderer.appendChild(surface, image);
    await tick();

    const committed = findCommitted(n => n.payload.testID === 'spinner');
    expect(committed?.viewName).toBe('ActivityIndicatorView');
    expect(committed?.payload.animating).toBe(true);
    const committedImage = findCommitted(n => n.payload.testID === 'image');
    expect(committedImage?.viewName).toBe('RCTImageView');
    expect(committedImage?.payload.source).toEqual({
      uri: 'https://example.invalid/image.png',
    });
  });

  // why: Angular's ɵɵstyleMap decomposes ONE `[style]` binding into MULTIPLE setStyle(key,
  // value) calls — RN's Fabric contract wants a single flat `style` prop, never per-key native
  // props, so the seam must accumulate them, not overwrite on each call.
  it('commits setProperty and merges per-key setStyle into one style prop', async () => {
    const { surface, renderer } = setup();
    const view = renderer.createElement('view');
    renderer.setProperty(view, 'nativeID', PROBE_ID);
    renderer.setStyle(view, 'padding', 24);
    renderer.setStyle(view, 'opacity', 0.5);
    renderer.appendChild(surface, view);
    await tick();

    const committed = findCommitted(n => n.payload.nativeID === PROBE_ID);
    expect(committed, 'the probed RCTView committed').toBeDefined();
    // Angular emits a [style] binding as per-key setStyle; the seam folds them into one style
    // object, then the engine HOISTS style keys to top-level Fabric props (RN's flat C++ props
    // contract — style is never a nested key on a committed node).
    expect(committed?.payload).toMatchObject({
      nativeID: PROBE_ID,
      padding: 24,
      opacity: 0.5,
    });
  });

  // why: Ivy compiles `class="card highlight"` into per-token addClass calls, never one string
  // (§1 of angular-adapter) — the renderer must accumulate tokens across calls, resolve them
  // through the SAME cross-adapter style registry React/Vue use, and an explicit [style] must
  // still win over a class-derived value (the same precedence every adapter's class+style merge
  // guarantees), or CSS-module/SFC-style classes would silently behave differently on Angular.
  it('resolves addClass tokens through the shared style registry and lets explicit style win', async () => {
    registerRules([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10, backgroundColor: 'red' },
      },
    ]);
    const { surface, renderer } = setup();
    const view = renderer.createElement('view');
    renderer.setProperty(view, 'nativeID', PROBE_ID);
    // Ivy compiles class="card highlight" to one addClass call per token, never a single string.
    renderer.addClass(view, 'card');
    renderer.addClass(view, 'highlight');
    renderer.setStyle(view, 'backgroundColor', 'blue');
    renderer.appendChild(surface, view);
    await tick();

    const committed = findCommitted(n => n.payload.nativeID === PROBE_ID);
    // padding comes from the class; backgroundColor is explicit style, so it wins over the
    // class-derived red — same precedence Vue's class="..."/:style="..." merge guarantees.
    expect(committed?.payload).toMatchObject({
      padding: 10,
      backgroundColor: 'blue',
    });
  });

  // why: TWO SOURCES OF CLASSES ON ONE NODE MUST UNION, and this guard exists because the adapter
  // is about to gain a second one. Angular shadows a `[class]` MAP into a directive input when the
  // directive declares `class` (`setShadowStylingInputFlags`, `view/directives.ts`), while
  // `[class.foo]` stays an `ɵɵclassProp` and keeps arriving as `addClass`. So a node can be told its
  // classes as a whole STRING and one TOKEN at a time in the same pass, and whichever writes last
  // must not erase the other — which a naive `routeProp(el, 'class', theString)` would do.
  //
  // Written against the renderer's two entry points directly, because that is what the two Ivy
  // instructions call and the union has to hold whatever order they come in.
  it('unions a whole class string with per-token classes, in either order', async () => {
    registerRules([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
      {
        tokens: ['wide'],
        specificity: [0, 1, 0],
        order: 1,
        style: { flexGrow: 1 },
      },
      {
        tokens: ['lit'],
        specificity: [0, 1, 0],
        order: 2,
        style: { opacity: 1 },
      },
    ]);
    const { surface, renderer } = setup();

    const mapFirst = renderer.createElement('view');
    renderer.setProperty(mapFirst, 'nativeID', 'map-first');
    renderer.setProperty(mapFirst, 'class', 'card wide');
    renderer.addClass(mapFirst, 'lit');
    renderer.appendChild(surface, mapFirst);

    const tokenFirst = renderer.createElement('view');
    renderer.setProperty(tokenFirst, 'nativeID', 'token-first');
    renderer.addClass(tokenFirst, 'lit');
    renderer.setProperty(tokenFirst, 'class', 'card wide');
    renderer.appendChild(surface, tokenFirst);
    await tick();

    // All three rules, from both channels, on both nodes.
    expect(
      findCommitted(n => n.payload.nativeID === 'map-first')?.payload,
    ).toMatchObject({ padding: 10, flexGrow: 1, opacity: 1 });
    expect(
      findCommitted(n => n.payload.nativeID === 'token-first')?.payload,
    ).toMatchObject({ padding: 10, flexGrow: 1, opacity: 1 });
  });

  // why: `[ngClass]`/`[class.foo]="false"` compiles to a removeClass call — the resolved style
  // must be RECOMPUTED from the remaining token set, not just have the removed class's own
  // style subtracted (which would break if two classes shared a key), matching removeClass's
  // "rejoin the whole Set" implementation strategy.
  it('removeClass drops a token and recomputes the resolved style', async () => {
    registerRules([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 10 },
      },
      {
        tokens: ['highlight'],
        specificity: [0, 1, 0],
        order: 1,
        style: { opacity: 0.5 },
      },
    ]);
    const { surface, renderer } = setup();
    const view = renderer.createElement('view');
    renderer.setProperty(view, 'nativeID', PROBE_ID);
    renderer.addClass(view, 'card');
    renderer.addClass(view, 'highlight');
    renderer.removeClass(view, 'highlight');
    renderer.appendChild(surface, view);
    await tick();

    const committed = findCommitted(n => n.payload.nativeID === PROBE_ID);
    expect(committed?.payload.padding).toBe(10);
    expect(committed?.payload.opacity).toBeUndefined();
  });

  // why: this exercises removeChild's TOP-LEVEL case only (`drop` is a direct surface child,
  // so `oldChild.parent` is undefined and the surface-level removeChild path runs) — the
  // "nested inside another node" case is a SEPARATE branch, covered by the next test.
  it('removeChild detaches a node from the next commit', async () => {
    const { surface, renderer } = setup();
    const keep = renderer.createElement('view');
    const drop = renderer.createElement('view');
    renderer.setProperty(drop, 'nativeID', PROBE_ID);
    renderer.appendChild(surface, keep);
    renderer.appendChild(surface, drop);
    await tick();
    expect(
      findCommitted(n => n.payload.nativeID === PROBE_ID),
      'present before remove',
    ).toBeDefined();

    renderer.removeChild(surface, drop);
    await tick();
    expect(
      findCommitted(n => n.payload.nativeID === PROBE_ID),
      'gone after remove',
    ).toBeUndefined();
  });

  // why: removeChild has TWO detach paths — this is the branch removeChild's own comment
  // ("Detach from the child's own retained parent... Angular's `parent` arg is ignored")
  // describes: a node nested one level below another node (not directly under the surface)
  // must be found via `oldChild.parent`, not the surface's own child list, or removing a
  // nested node would silently no-op.
  it('removeChild detaches a nested node (not a direct surface child) from its retained parent', async () => {
    const { surface, renderer } = setup();
    const container = renderer.createElement('view');
    const nested = renderer.createElement('view');
    renderer.setProperty(nested, 'nativeID', PROBE_ID);
    renderer.appendChild(container, nested);
    renderer.appendChild(surface, container);
    await tick();
    expect(
      findCommitted(n => n.payload.nativeID === PROBE_ID),
      'present before remove',
    ).toBeDefined();

    renderer.removeChild(container, nested);
    await tick();
    expect(
      findCommitted(n => n.payload.nativeID === PROBE_ID),
      'gone after remove',
    ).toBeUndefined();
  });

  // why: Angular's addLViewToLContainer treats a null parent from parentNode/insertBefore as
  // "defer, a later projection pass places it" — bypassing that contract lets FlatList cells render
  // outside their ScrollView. insertBefore must position a node BETWEEN siblings, not just append.
  it('insertBefore positions a new child before an existing sibling under the surface', async () => {
    const { surface, renderer } = setup();
    const first = renderer.createElement('text');
    renderer.appendChild(first, renderer.createText('first'));
    const last = renderer.createElement('text');
    renderer.appendChild(last, renderer.createText('last'));
    renderer.appendChild(surface, first);
    renderer.appendChild(surface, last);
    await tick();
    expect(serializedApp()).toBe(
      'RCTText(RCTRawText "first")RCTText(RCTRawText "last")',
    );

    const middle = renderer.createElement('text');
    renderer.appendChild(middle, renderer.createText('middle'));
    renderer.insertBefore(surface, middle, last);
    await tick();

    expect(serializedApp()).toBe(
      'RCTText(RCTRawText "first")RCTText(RCTRawText "middle")RCTText(RCTRawText "last")',
    );
  });

  // why: appendChild's own comment explains a null `parent` means "this content is awaiting its
  // host component's own projection — skip silently now, the later projection pass places it
  // correctly" (mirroring Angular's `if (parentRNode !== null)` guard). A silent skip here is
  // the CORRECT, intentional contract — not a bug to throw on — so this proves it doesn't throw
  // and doesn't commit the orphaned child anywhere it shouldn't be.
  it('appendChild silently defers a null parent instead of throwing or misplacing the child', async () => {
    const { renderer } = setup();
    const orphan = renderer.createElement('view');
    expect(() => renderer.appendChild(null, orphan)).not.toThrow();
    await tick();

    // Nothing reached a surface, so no commit was ever requested — the recording host's own
    // commit counter, not `fabric.committed` (a mirror-only field): a create with no attach
    // still shows up in the CREATION log, which is not the claim under test.
    expect(fabric.commits).toBe(0);
  });

  // why: setAttribute/removeAttribute are the STATIC-attribute half of Renderer2 (an unbound
  // `testID="x"` literal, per angular-adapter §10) — a separate Renderer2 method from
  // setProperty, and previously untested; if it silently no-oped, every static (non-bound)
  // attribute in a template would render without its value.
  it('setAttribute commits a static attribute and removeAttribute clears it', async () => {
    const { surface, renderer } = setup();
    const view = renderer.createElement('view');
    renderer.setProperty(view, 'nativeID', PROBE_ID);
    renderer.setAttribute(view, 'testID', 'static-attr');
    renderer.appendChild(surface, view);
    await tick();
    expect(
      findCommitted(n => n.payload.nativeID === PROBE_ID)?.payload.testID,
    ).toBe('static-attr');

    renderer.removeAttribute(view, 'testID');
    await tick();
    // The op stream spells a removed key with `NO_VALUE`, which the recording obeys by deleting
    // it — the key's ABSENCE is proof a clearing op was sent, not a `null` the mirror's
    // clone-on-write merge produced (`.docs/mirror-elimination.md`, "RESOLVED: the
    // `onLayout === null` decision").
    expect(
      Object.hasOwn(
        findCommitted(n => n.payload.nativeID === PROBE_ID)?.payload ?? {},
        'testID',
      ),
    ).toBe(false);
  });

  // why: removeStyle is setStyle's inverse (an `[ngStyle]` binding removing one key) — it must
  // drop ONLY the named key and keep the rest of the accumulated style object, not clear style
  // entirely; untested before this rewrite even though setStyle's merge behavior was.
  it('removeStyle drops one key and keeps the rest of the accumulated style', async () => {
    const { surface, renderer } = setup();
    const view = renderer.createElement('view');
    renderer.setProperty(view, 'nativeID', PROBE_ID);
    renderer.setStyle(view, 'padding', 24);
    renderer.setStyle(view, 'opacity', 0.5);
    renderer.removeStyle(view, 'opacity');
    renderer.appendChild(surface, view);
    await tick();

    const committed = findCommitted(n => n.payload.nativeID === PROBE_ID);
    expect(committed?.payload.padding).toBe(24);
    expect(committed?.payload.opacity).toBeUndefined();
  });

  // why: setValue is Angular's `ɵɵtextInterpolate`/`{{binding}}` update path (renderer.ts's own
  // comment: "the one place a stale binding shows up as 'the setValue never fired'") — it must
  // actually replace the committed RawText's text on a SECOND call, not just set it once at
  // creation.
  it('setValue updates a committed RawText node on a later call', async () => {
    const { surface, renderer } = setup();
    const text = renderer.createElement('text');
    renderer.setProperty(text, 'nativeID', PROBE_ID);
    const raw = renderer.createText('first');
    renderer.appendChild(text, raw);
    renderer.appendChild(surface, text);
    await tick();
    expect(
      findCommitted(n => n.payload.nativeID === PROBE_ID)?.children[0]?.payload
        .text,
    ).toBe('first');

    renderer.setValue(raw, 'second');
    await tick();
    expect(
      findCommitted(n => n.payload.nativeID === PROBE_ID)?.children[0]?.payload
        .text,
    ).toBe('second');
  });

  // why: parentNode/nextSibling back Angular's own DOM-shaped tree-walk internals (e.g.
  // insertAnchorNode, addLViewToLContainer) — parentNode must resolve to `undefined` (not throw
  // or return the surface) for a TOP-LEVEL node, matching the "no retained parent -> null"
  // contract removeChild also relies on; nextSibling must walk the SAME retained children array
  // parentNode points into.
  it('parentNode and nextSibling reflect the retained tree structure', async () => {
    const { surface, renderer } = setup();
    const container = renderer.createElement('view');
    const childA = renderer.createElement('view');
    const childB = renderer.createElement('view');
    renderer.appendChild(container, childA);
    renderer.appendChild(container, childB);
    renderer.appendChild(surface, container);
    await tick();

    expect(renderer.parentNode(childA)).toBe(container);
    expect(renderer.parentNode(container)).toBeNull();
    expect(renderer.nextSibling(childA)).toBe(childB);
    expect(renderer.nextSibling(childB)).toBeNull();
  });

  // why: render.ts's mount() relies on ONE Renderer2 instance per surface (file header: "One
  // renderer per mounted surface... every mutation asks the surface to (microtask-coalesced)
  // recommit") — createRenderer's `this.renderer ??= ...` memoization is the whole reason every
  // component's mutations collapse into that shared surface's coalesced commit; without it,
  // this is still an explicit, previously-unverified contract of the factory itself.
  it('SymbioteRendererFactory returns the same renderer instance for every component', () => {
    const surface = createSurface(ROOT_TAG);
    const factory = new SymbioteRendererFactory(surface);
    const first = factory.createRenderer(null, null);
    const second = factory.createRenderer(null, null);
    expect(second).toBe(first);
  });

  // why: the factory hands ONE renderer to every component, so Angular calls `destroy()` on it
  // whenever ANY component's views are torn down — a keyed `@for` replace destroys a thousand — and
  // the instance then goes on serving every view that is still alive. A `destroy()` that closed the
  // renderer's flush door left those views writing into an accumulator nothing would publish: the
  // style only reached Fabric when some OTHER node's run happened to close it, which on the
  // benchmark screen was two steps later.
  //
  // The product rule is the plain one — a style written after some component was destroyed still
  // paints — and it is the whole of the Angular `select` defect this repo carried in
  // `angular-select-reaches-fabric.itest.ts`.
  it('keeps publishing styles after Angular destroys the shared renderer', async () => {
    const { surface, renderer } = setup();
    const node = renderer.createElement('view');
    renderer.appendChild(surface, node);
    renderer.setStyle(node, 'height', 44);
    await tick();

    // A component somewhere else goes away, and Angular tells the SHARED renderer about it.
    renderer.destroy();

    // A view that is still alive restyles. Nothing else writes, so nothing else can close the run
    // on its behalf — which is exactly the shape the defect needed.
    renderer.setStyle(node, 'borderLeftWidth', 3);
    await tick();

    // The LIVE tree, because the question is what Fabric HOLDS — a creation-log search would answer
    // about a node that exists rather than about the style that reached it.
    const painted = findCommitted(
      node => node.payload.borderLeftWidth !== undefined,
    );
    expect(painted !== undefined).toBe(true);
    // AND THE FIRST STYLE SURVIVED, which is the half a naive fix would lose: the run is seeded
    // from what stands, so publishing the new key must not drop the old one.
    expect(painted?.payload.height).toBe(44);
  });

  // why: *ngIf/@if/@for need a stable position marker with no visual footprint — an anchor
  // must never paint as a real Fabric view (that would be a stray invisible-but-present node
  // in the committed tree), while its OWN children still land at the correct sibling position.
  it('createComment yields an anchor the commit walk skips but flattens its children', async () => {
    const { surface, renderer } = setup();
    const anchor = renderer.createComment();
    renderer.appendChild(anchor, renderer.createElement('view'));
    renderer.appendChild(surface, anchor);
    renderer.appendChild(surface, renderer.createElement('text'));
    await tick();

    // The anchor never reaches Fabric; its child keeps the same sibling position. Angular
    // composed components use this to make their framework host element disappear.
    expect(serializedApp()).toBe('RCTViewRCTText');
  });

  // why: Angular hands (press)="x" the event name EXPLICITLY at compile time (no onX->x
  // inference React/Vue need) — listen must register under that literal name and unlisten must
  // actually remove it, not just stop firing without cleaning the listener map (a leak).
  it('listen attaches an explicit event listener and the unlisten fn removes it', () => {
    const { renderer } = setup();
    const view = renderer.createElement('view');
    expect(isSymbioteNode(view)).toBe(true);
    if (!isSymbioteNode(view))
      throw new Error('unreachable: createElement returns a node');

    const unlisten = renderer.listen(view, 'press', () => {});
    expect(
      view.listeners?.has('press'),
      'listener attached under the explicit name',
    ).toBe(true);
    unlisten();
    expect(view.listeners?.has('press'), 'unlisten removed it').toBe(false);
  });

  // why: `window`/`document`/`body` have no Fabric node to attach to — listen must degrade to a
  // harmless no-op (both the subscribe call and the returned unlisten) rather than throw on
  // `isSymbioteNode(target)` returning false, since Angular's own event-binding codegen calls
  // listen() uniformly regardless of whether the target happens to be a global.
  it('listen on a global target (window/document) is an inert no-op', () => {
    const { renderer } = setup();
    expect(() => renderer.listen('window', 'resize', () => {})()).not.toThrow();
  });

  // why: §11a of angular-adapter documents a real, TWICE-regressed device bug: a component
  // mounted via NgComponentOutlet/ViewContainerRef.createComponent (every Stack/Tab/Drawer
  // screen) reaches createElement with its selector LOWERCASED by Angular's own runtime, while
  // a STATIC template tag keeps its authored case — ANCHOR_HOST_COMPONENTS lookup must
  // normalize both sides or a dynamically-mounted screen silently renders blank. This was
  // caught by neither vitest nor a real ngc AOT build the first two times it regressed; a
  // direct test for the lowercase-lookup contract is the only thing that closes that gap here.
  it('anchor-hosts a registered selector regardless of the lookup case (§11a)', () => {
    registerComposedComponent('MixedCaseScreen');
    const { renderer } = setup();
    const node = renderer.createElement('mixedcasescreen');
    if (!isSymbioteNode(node))
      throw new Error('unreachable: createElement returns a node');
    expect(
      isAnchor(node),
      'a dynamically-mounted screen lowercases before reaching here',
    ).toBe(true);
  });

  // App/third-party selectors must not be hardcoded into ANCHOR_HOST_COMPONENTS — the owning
  // package registers itself via registerComposedComponent, same as an adapter-owned composed
  // component. 'RefApiDemo' names examples/angular's demo component; this test never imports
  // it, it only proves the renderer treats an unregistered selector as a raw Fabric view name,
  // not a hardcoded anchor host. MUST run before the registration test below, since
  // registerComposedComponent mutates the module-level Set for the rest of the file.
  it('does not anchor-host an app-owned selector unless it self-registers', () => {
    const { renderer } = setup();
    const node = renderer.createElement('RefApiDemo');
    if (!isSymbioteNode(node))
      throw new Error('unreachable: createElement returns a node');
    expect(
      isAnchor(node),
      'falls through to a raw Fabric view, not an anchor',
    ).toBe(false);
    expect(node.component).toBe('RefApiDemo');
  });

  // why: §11 of angular-adapter — a composed component's selector MUST get an anchor host once
  // registered, or it falls through to createElement's raw-Fabric-view path and RN's own
  // "Unimplemented component" fallback paints in its place on a real device (never provable by
  // vitest alone, but the registration -> isAnchor flip itself is).
  it('anchor-hosts an app-owned selector once it self-registers via registerComposedComponent', () => {
    registerComposedComponent('RefApiDemo');
    const { renderer } = setup();
    const node = renderer.createElement('RefApiDemo');
    if (!isSymbioteNode(node))
      throw new Error('unreachable: createElement returns a node');
    expect(isAnchor(node)).toBe(true);
  });
});

// Negative: the one throwing path in this whole seam. A bare RCTRawText landing directly under
// the surface (or under a non-<text> host) would actually paint in real Fabric — assertTextPlacement
// exists specifically to fail loudly at the seam instead of shipping an invalid native tree.
describe('Angular SymbioteRenderer rejects text placed outside a <text> host', () => {
  // why: Angular's own ɵɵtext only ever lands inside a <text> in a correct template, but a bug
  // (or a hand-authored createElement/appendChild sequence like this test's) could still hand a
  // raw text node to a View or the surface directly — that must throw immediately with an
  // actionable message, not silently commit an invalid tree RN's native side then mishandles.
  it('throws when a raw text node is appended directly to the surface', () => {
    const { surface, renderer } = setup();
    const raw = renderer.createText('stray');
    expect(() => renderer.appendChild(surface, raw)).toThrow(
      /must be rendered inside a <text>/,
    );
  });

  // why: the same guard must apply to insertBefore, not just appendChild — a raw text node
  // dropped via `insertBefore` into a non-text host is exactly as invalid a Fabric tree as via
  // appendChild, and Angular's own codegen can reach either call for structural insertion.
  it('throws when a raw text node is inserted directly under a non-<text> View host', () => {
    const { surface, renderer } = setup();
    const view = renderer.createElement('view');
    renderer.appendChild(surface, view);
    const raw = renderer.createText('stray');
    expect(() => renderer.insertBefore(view, raw, null)).toThrow(
      /must be rendered inside a <text>/,
    );
  });
});
