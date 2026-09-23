// An Angular custom renderer over @symbiote-native/engine. Angular components never touch the
// DOM directly — every paint goes through Renderer2 (created per-component by
// RendererFactory2). We provide OUR factory, so each Renderer2 method maps onto the
// engine's tiny mutation API; the engine owns all Fabric clone-on-write, shared with
// every other adapter. This is the Angular twin of adapters/vue/src/renderer.ts — proof
// that the same engine mutation API drives both frameworks.

import {
  appendChild,
  createAnchor,
  createElement,
  createRawText,
  componentOf,
  dlog,
  getExplicitStyle,
  insertBefore,
  isDebug,
  isRawTextNode,
  isSymbioteEvent,
  isSymbioteNode,
  isTextContainer,
  isSameShallowStyle,
  nextSiblingOf,
  parentOf,
  propOf,
  registerBeforeFlush,
  removeChild,
  routeProp,
  setEventListener,
  setText,
  textOf,
  toPublicInstance,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  COMPONENT_DESCRIPTORS,
  descriptorFor,
} from '@symbiote-native/components';
import type { Renderer2, RendererFactory2, RendererType2 } from '@angular/core';
import { isAnchorHostComponent } from '../anchor-host-registry';
import {
  countAngular,
  noteAngularCreate,
  noteAngularStyleWrite,
  noteAngularWrite,
} from '../diagnostics';
// Angular host nodes are all SymbioteNode (elements, raw text, anchors). The mount
// container is the surface, so a parent can be either a node or the surface root.
type IHostNode = ISymbioteNode;
type IHostElement = ISymbioteNode | SymbioteSurface;

function isSurface(parent: IHostElement): parent is SymbioteSurface {
  return parent instanceof SymbioteSurface;
}

function isRawText(node: ISymbioteNode): boolean {
  return isRawTextNode(node);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// RN's TWO TEXT DEFAULTS LEFT THIS RENDERER ENTIRELY ON 2026-09-18, in two steps a fortnight apart.
// The SEED went first, to the payload builder — writing them as props cost a crossing every time an
// app authored the same value (6 000 per 1 000-row create, `writesOfUnchanged`). What stayed was a
// resolver for the clear-back path: a write of `undefined` looked up the default instead of clearing.
//
// That is gone too, and for the reason the seed was: `applyTextDefaults` (and its C++ twin) runs on
// EVERY commit of every `RCTText`, so a cleared key is absent for exactly as long as it takes the
// payload builder to supply the default again. The resolver was answering a question nothing asks.
//
// `PROP_ALIASES` (`id` -> `nativeID`) left this renderer on 2026-09-18 — `routeProp` resolves it
// for every adapter now, so every path that can set a prop still reaches it.
// Angular's two-way sugar `[(value)]` compiles to a `(valueChange)` binding; the engine knows the
// same fold as the function prop `onValueChange`. See `listen()`. The two names live in a leaf
// module so `elements.ts`'s ControlValueAccessor can name them without importing this cyclic file.
import { VALUE_CHANGE_EVENT, VALUE_CHANGE_PROP } from './value-change';
import {
  createCallbackWrapper,
  flushViewFor,
  isWrappableCallback,
  markReadBackNode,
  type ICallbackWrapper,
} from '../change-detection-flush';

// The tags whose behavior reads the app's answer back inside the event's own turn - the three
// behaviors `../change-detection-flush` names, plus the multiline spelling of the input. Marked at
// creation so a flush finds their view lazily instead of a directive instance per element.
const READ_BACK_TAGS: ReadonlySet<string> = new Set([
  'text-input',
  'text-input-multiline',
  'switch',
  'refresh-control',
]);

// The property binding an RN StyleProp travels as; see `SymbioteElement.style`.
const STYLE_PROP_BINDING = 'styleProp';

// The app callbacks an engine behavior READS BACK inside the same microtask turn, as an Angular
// `(event)` binding — `valueChange` is handled in `listen` on its own, since it also needs the field
// unwrapped. Zoneless change detection is a macrotask, so without a flush the behavior reads the
// PRE-event value; `../change-detection-flush` holds the whole mechanism, the three behaviors, and
// why this is scoped rather than wired to the engine's event-dispatch seam.
//
// The other spelling — the `[onRefresh]` flat-bag PROP — is not here: an `on*` function prop is
// wrapped by `SymbioteElement` itself, which reaches every one of them rather than a named three,
// and adds the `markForCheck` a prop callback needs and an event binding gets from Angular.
const READ_BACK_EVENTS: ReadonlySet<string> = new Set(['refresh']);

// How many distinct style objects the renderer keeps to hand back by identity. A screen's styles are
// a handful; the bench row has four. See `publishedStyles`.
const STYLE_CACHE = 16;

type IReadBackListener = (event: unknown) => unknown;

// `listen(VALUE_CHANGE_EVENT)` can be called TWICE for the SAME logical `(valueChange)`/`[(value)]`
// binding on a MATCHED element — Angular's own compiled output-binding codegen wires one listener,
// `ValueChangeElement.ngOnInit`'s manual bridge wires a second (`lowered-two-way-value.test.ts`,
// "delivers a bound handler exactly once per change"). Those two must DEDUPE (last one replaces,
// not composes — firing both double-delivers the identical value). A genuinely different explicit
// `[onValueChange]` app-level handler (routed here via `ngOnChanges`'s generic per-input loop) must
// instead be PRESERVED and called alongside the bridge, or it silently stops firing the moment
// `[(value)]`/`(valueChange)` is also bound. This set is what tells the two cases apart.
const bridgedValueChangeHandlers = new WeakSet<IReadBackListener>();

// The genuinely explicit `[onValueChange]` app handler for a node, if one is bound — read LIVE by
// the composed forward function on every event rather than captured once at compose time. That is
// what makes handler installation order-independent: `ngOnChanges` (the explicit handler) and the
// two `listen(VALUE_CHANGE_EVENT)` calls (the bridge, see below) can happen in any interleaving —
// at initial mount OR on a later `[onValueChange]` rebind (`ngOnChanges` again, same code path,
// routed through `setProperty`) — without one silently overwriting the other's closure.
const explicitValueChangeHandlers = new WeakMap<
  ISymbioteNode,
  IReadBackListener
>();

function composeValueChangeHandler(
  target: ISymbioteNode,
  bridgeCallback: (event: unknown) => boolean | void,
): IReadBackListener {
  const forwardValue = withChangeDetection(target, (event: unknown) => {
    explicitValueChangeHandlers.get(target)?.(event);
    if (isSymbioteEvent(event)) {
      if ('text' in event) return bridgeCallback(event.text);
      if ('value' in event) return bridgeCallback(event.value);
    }
    return bridgeCallback(event);
  });
  bridgedValueChangeHandlers.add(forwardValue);
  return forwardValue;
}

function isReadBackListener(value: unknown): value is IReadBackListener {
  return typeof value === 'function';
}

function withChangeDetection(
  node: IHostElement,
  listener: IReadBackListener,
): IReadBackListener {
  return (event: unknown): unknown => {
    const result = listener(event);
    flushViewFor(node);
    return result;
  };
}

// Diagnostic-only: tags each anchor with a sequential id so log lines can tell distinct
// anchors apart (they all otherwise print the same generic '#anchor' component name).
// Gated behind isDebug() so a production build pays zero cost (no WeakMap writes).
let anchorDebugCounter = 0;
const anchorDebugIds = new WeakMap<ISymbioteNode, number>();
function tagAnchorForDebug(node: ISymbioteNode): ISymbioteNode {
  if (isDebug()) {
    anchorDebugCounter += 1;
    anchorDebugIds.set(node, anchorDebugCounter);
  }
  return node;
}

// Diagnostic identity string for a renderer node/surface — component name, or 'surface'.
// Null-tolerant: a diagnostic must never throw (Angular hands insertBefore a null refChild).
function describeHost(node: IHostElement | null | undefined): string {
  if (node === null || node === undefined) return 'null';
  if (isSurface(node)) return 'surface';
  const anchorId = anchorDebugIds.get(node);
  return anchorId !== undefined
    ? `${componentOf(node)}#${anchorId}`
    : componentOf(node);
}

// A hand-written tag ngtsc accepts must contain a HYPHEN, so the six dashless intrinsics
// (`view`/`text`/`pressable`/`image`/`switch`/`modal`) need a second spelling that has one.
// `hasElement`/`hasProperty` gate the CUSTOM_ELEMENTS_SCHEMA branch behind
// `normalizedTag.includes('-')` (compiler/src/schema/dom_element_schema_registry.ts), so a dashless
// tag is NG8001 under every schema but NO_ERRORS_SCHEMA — which switches off element checking
// entirely. Dropping the `symbiote-` prefix from the tag alphabet is what took the dash away.
//
// A per-tag directive is the other repair, and it is the one an app should reach for now that
// `SYMBIOTE_ELEMENTS` exists (`../elements.ts`). Matching a directive does turn every bound prop
// into an input lookup — the sentence that used to end this paragraph — but that is a repair
// rather than a dead end: declare the input and the lookup succeeds, with a real TYPE, which no
// schema gives. This alias map stays for the `symbiote-*` spelling and for an app that has not
// imported the directives.
//
// Derived, so a future dashless intrinsic joins by existing; when the alphabet regains its dashes
// upstream every entry becomes identity and the map can go. See `bare-intrinsic-tag-aot.test.ts`.
const HYPHEN_PREFIX = 'symbiote-';

function hyphenatedIntrinsicAliases(): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const tag of Object.keys(COMPONENT_DESCRIPTORS)) {
    if (tag.includes('-')) continue;
    aliases[`${HYPHEN_PREFIX}${tag}`] = tag;
  }
  return aliases;
}

const PRIMITIVE_SELECTOR_ALIAS: Record<string, string> = {
  // Public ergonomic selectors map directly to the engine primitive descriptors.
  View: 'view',
  Text: 'text',
  ...hyphenatedIntrinsicAliases(),
};

// The ANCHOR_HOST_COMPONENTS Set and registerComposedComponent now live in the dependency-free
// leaf module ../anchor-host-registry (imported above as isAnchorHostComponent) — see its header
// for why the registry must NOT sit in this require-cyclic renderer module.

// Inserting a bare raw-text node anywhere but inside a <text> is invalid in Fabric (a
// stray RCTRawText would paint). Angular's ɵɵtext only ever lands text inside a <text>,
// but guard anyway for parity with the Vue adapter and to fail loudly on a bad template.
function assertTextPlacement(child: ISymbioteNode, parent: IHostElement): void {
  if (isRawText(child) && (isSurface(parent) || !isTextContainer(parent))) {
    throw new Error(
      `Text string "${textOf(child) ?? ''}" must be rendered inside a <text>`,
    );
  }
}

// One renderer per mounted surface. Every mutation asks the surface to (microtask-
// coalesced) recommit — the same seam Vue uses; a burst of Angular change-detection
// mutations collapses into one completeRoot.
export class SymbioteRenderer implements Renderer2 {
  readonly data: Record<string, unknown> = {};
  // Angular calls destroyNode per-node only when this is non-null; teardown happens in
  // render.ts (unmount), so per-node cleanup is a no-op.
  destroyNode: ((node: ISymbioteNode) => void) | null = null;

  // THE STYLING RUN, and why it is held rather than published key by key.
  //
  // Angular has no whole-value styling call: `ɵɵstyleMap` / `ɵɵclassMap` walk the key-value array
  // and call `setStyle` / `addClass` once PER KEY (`updateStyling` -> `applyStyling`, upstream
  // `@angular/core`). RN wants one `style` prop, so publishing on each call rebuilt the whole object
  // every time — N writes for an N-key style, the k-th carrying k keys, and N DISTINCT values where
  // the app authored one. Measured on the headless bench arm: `values` 10 001 against Vue's 3 004
  // for the identical tree, and `convert` 30.0 ms against 0.6.
  //
  // The run is safe to hold because it is CONTIGUOUS: `updateStyling` takes its node from
  // `getSelectedIndex()` and the loop never changes element mid-way, so the calls for one node
  // arrive with nothing between them. Anything else — a different node, any other renderer call, a
  // host read, the commit — closes it first.
  // `ISymbioteNode`, not `IHostElement`: a surface is turned away by `isSurface` at every entry
  // point, so a run can only ever be open on a real node, and saying so keeps the publish below
  // free of a second guard.
  private pendingStyleNode: ISymbioteNode | undefined;
  private pendingStyle: Record<string, unknown> = {};
  // A node with no standing style is matched against a published style key by key, as Angular hands
  // the keys over, and builds nothing while they match. Rows sharing a style then skip the
  // accumulator and the shallow compare's two key arrays (~320 B a `view` on create). The first
  // mismatch materializes the accumulator from the keys matched so far.
  private matchCandidate: Record<string, unknown> | undefined;
  private matchCandidateSize = 0;
  private readonly matchedKeys: string[] = [];
  private pendingClassNode: ISymbioteNode | undefined;
  private readonly releaseBeforeFlush: () => void;

  constructor(private readonly surface: SymbioteSurface) {
    // A READ AND A COMMIT BOTH ARRIVE FROM ELSEWHERE, so the renderer cannot close the run on its
    // own: a turn whose last act is a style change has no next call to close it, and the commit
    // would paint the node without it. `flushOps` is the one door in front of every drain.
    this.releaseBeforeFlush = registerBeforeFlush(() => this.flushStyling());
  }

  /**
   * Angular is done with this renderer FOR ONE COMPONENT — which is not the same as this renderer
   * being done, and the difference was a shipped bug.
   *
   * The factory hands ONE instance to every component on the surface, so Angular calls this
   * whenever ANY component's views are torn down; a keyed `@for` replace destroys a thousand. So it
   * publishes what it is holding and nothing more. Releasing the `beforeFlush` registration here
   * closed the only door a style run has — `flushOps` is what asks a renderer for what it holds —
   * while every still-living view went on writing into the accumulator. The style then reached
   * Fabric only when some OTHER node's `openStyleRun` happened to close the run, which on the
   * benchmark screen was two steps after the selection that asked for it.
   *
   * The registration follows the SURFACE now, and `SymbioteRendererFactory.dispose` releases it.
   */
  destroy(): void {
    this.flushStyling();
  }

  /** The surface is going away — publish what is held and stop listening. See `destroy` above. */
  dispose(): void {
    this.flushStyling();
    this.releaseBeforeFlush();
  }

  /**
   * Publish whatever the styling run is holding. Idempotent, and free when it holds nothing.
   *
   * IT DOES NOT REQUEST A COMMIT, and that is not an omission — the request is made when the style
   * is ACCUMULATED, exactly where it was made before the run existed. This runs from inside
   * `flushOps`, which the commit itself calls first, so asking there schedules a SECOND commit whose
   * tree is already current: a full `completeRoot` plus a Yoga pass for nothing.
   *
   * Measured, because it did not look like a cost. The bench arm's `select` fell 17.1 -> 3.8 ms and
   * its `remove` rose 7.1 -> 18.2 in the same runs — the extra commit lands in whichever step's
   * microtask happens to run it, so the work had MOVED between steps rather than gone. Two rows
   * moving by the same amount in opposite directions is what that always looks like.
   */
  private flushStyling(): void {
    const styled = this.pendingStyleNode;
    if (styled !== undefined) {
      this.pendingStyleNode = undefined;
      const candidate = this.matchCandidate;
      if (
        candidate !== undefined &&
        this.matchedKeys.length === this.matchCandidateSize
      ) {
        this.matchCandidate = undefined;
        routeProp(styled, 'style', candidate);
      } else {
        this.materializeMatch();
        const style = this.pendingStyle;
        this.pendingStyle = {};
        routeProp(styled, 'style', this.canonicalStyle(style));
      }
    }
    const classed = this.pendingClassNode;
    if (classed !== undefined) {
      this.pendingClassNode = undefined;
      routeProp(classed, 'class', this.classStringFor(classed));
    }
  }

  /**
   * The union of a node's two class sources, or `undefined` when it has none.
   *
   * A node can be told its classes BOTH ways in one pass: Ivy compiles `[class.foo]`, `[ngClass]`
   * and a static `class=` down to per-token `addClass`/`removeClass`, while a whole-string `class`
   * arrives at `setProperty` — which is the shape Angular uses when a directive declares `class` as
   * an input and the styling binding is shadowed into it (`setShadowStylingInputFlags`,
   * `view/directives.ts`). Publishing either one alone erases the other, and the DOM renderer this
   * mirrors has no such problem because `classList` accumulates for it.
   */
  private classStringFor(el: ISymbioteNode): string | undefined {
    const tokens = this.classTokens.get(el);
    const whole = this.classStrings.get(el);
    if (whole === undefined) {
      return tokens !== undefined && tokens.size > 0
        ? [...tokens].join(' ')
        : undefined;
    }
    if (tokens === undefined || tokens.size === 0) {
      return whole.length > 0 ? whole : undefined;
    }
    const union = new Set(
      whole.split(/\s+/u).filter(token => token.length > 0),
    );
    for (const token of tokens) union.add(token);
    return union.size > 0 ? [...union].join(' ') : undefined;
  }

  /**
   * Style objects this renderer has already published, so a list of identical rows sends ONE.
   *
   * The intern table keys by IDENTITY, so a fresh object per node is a fresh entry per node and the
   * host converts every entry across JSI. Measured on the bench arm: `values` 7 001 against Vue's
   * 3 004 for the identical tree, with `convert` 19.5 ms against 0.6 — and the gap is the KIND
   * rather than the count, ~4 000 of Angular's being objects that convert recursively where Vue's
   * are scalars plus four hoisted styles every row shares.
   *
   * Angular cannot share them on its own: `ɵɵstyleMap` hands over KEYS, so the object is this
   * renderer's own construction. Recognising one it has already built is what puts an Angular app
   * back on the footing of a framework whose author hoisted the constant.
   *
   * SMALL AND MRU. A screen has a handful of distinct styles and re-publishes them thousands of
   * times, so a hit is almost always at the front; a miss costs at most `STYLE_CACHE` shallow
   * compares, which is nothing beside the conversion it saves. An app with more distinct styles than
   * this simply stops sharing — it never stops being correct.
   */
  private readonly publishedStyles: Record<string, unknown>[] = [];
  // Key count of each entry above, index for index: how a key-by-key match knows it is complete.
  private readonly publishedSizes: number[] = [];

  /** A published object equal to this one, or this one — which then becomes the published copy. */
  private canonicalStyle(
    style: Record<string, unknown>,
  ): Record<string, unknown> {
    for (let at = 0; at < this.publishedStyles.length; at += 1) {
      const known = this.publishedStyles[at];
      if (!isSameShallowStyle(style, known)) continue;
      if (at > 0) {
        this.publishedStyles.splice(at, 1);
        this.publishedStyles.unshift(known);
        this.publishedSizes.unshift(this.publishedSizes.splice(at, 1)[0]);
      }
      return known;
    }
    this.publishedStyles.unshift(style);
    this.publishedSizes.unshift(Object.keys(style).length);
    if (this.publishedStyles.length > STYLE_CACHE) {
      this.publishedStyles.pop();
      this.publishedSizes.pop();
    }
    return style;
  }

  /** Open this node's style run (closing any other); a no-op when it is already the open one. */
  private openRun(el: ISymbioteNode): void {
    if (this.pendingStyleNode === el) return;
    this.flushStyling();
    this.pendingStyleNode = el;
    // Seeded from what is STANDING, because Angular sends only the keys that changed — an update
    // that moves one key must not drop the rest.
    const current = getExplicitStyle(el);
    if (isRecord(current)) {
      this.pendingStyle = { ...current };
      return;
    }
    this.isChoosingCandidate = true;
    this.matchedKeys.length = 0;
  }

  // The FIRST key picks the candidate: a row alternates styles (row, cell, cell, input), so the
  // front entry is usually the neighbour's.
  private isChoosingCandidate = false;

  private chooseCandidate(key: string, value: unknown): void {
    this.isChoosingCandidate = false;
    if (value === undefined) return;
    for (let at = 0; at < this.publishedStyles.length; at += 1) {
      const known = this.publishedStyles[at];
      if (!Object.is(known[key], value)) continue;
      this.matchCandidate = known;
      this.matchCandidateSize = this.publishedSizes[at] ?? 0;
      return;
    }
  }

  /** Stop matching: write the keys matched so far into the accumulator the run goes on with. */
  private materializeMatch(): void {
    this.isChoosingCandidate = false;
    const candidate = this.matchCandidate;
    if (candidate === undefined) return;
    this.matchCandidate = undefined;
    for (const key of this.matchedKeys) this.pendingStyle[key] = candidate[key];
  }

  /** The accumulator for this node's style run, opening one (and closing any other) if needed. */
  private openStyleRun(el: ISymbioteNode): Record<string, unknown> {
    this.openRun(el);
    this.materializeMatch();
    return this.pendingStyle;
  }

  private writeStyle(el: ISymbioteNode, key: string, value: unknown): void {
    this.openRun(el);
    if (this.isChoosingCandidate) this.chooseCandidate(key, value);
    const candidate = this.matchCandidate;
    if (
      candidate !== undefined &&
      value !== undefined &&
      Object.is(candidate[key], value) &&
      !this.matchedKeys.includes(key)
    ) {
      this.matchedKeys.push(key);
      return;
    }
    this.materializeMatch();
    this.pendingStyle[key] = value;
  }

  createElement(name: string): IHostNode {
    // `name` is the component's host tag — a symbiote intrinsic (`view`,
    // `text`, …), a public ergonomic alias (`View`, `Text`), or a raw Fabric view
    // name for a native leaf. Public aliases are normalized to their engine primitive name
    // before descriptor lookup. descriptorFor resolves it; an unknown `symbiote-*` is a typo,
    // any other string flows through as a raw Fabric name (events/processors derived from its
    // ViewConfig). The imperative API (measure / setNativeProps / focus) is on the node's
    // prototype, so toPublicInstance hands back the SAME identity the commit mirror keys on.
    countAngular('nodesCreated');
    noteAngularCreate(name);
    const engineName = PRIMITIVE_SELECTOR_ALIAS[name] ?? name;

    // An INTRINSIC is never an anchor, and the check has to come first now that the tags carry no
    // prefix. The anchor registry is keyed on lowercased selectors — Angular lowercases a
    // dynamically-mounted component's selector at runtime, so it must be — and the composed
    // wrappers are named after the primitives they render: `Text`.toLowerCase() IS the tag `text`.
    // While both layers exist, every `<text>` would anchor instead of painting.
    //
    // Derived from the descriptor table rather than an exclusion list, so it cannot go stale; and
    // it disappears on its own when the wrappers do, which is what this migration is for. The
    // collision is exactly the single-word names — `TextInput` lowercases to `textinput`, which is
    // no tag of ours.
    if (
      COMPONENT_DESCRIPTORS[engineName] === undefined &&
      isAnchorHostComponent(engineName)
    ) {
      const anchor = tagAnchorForDebug(createAnchor());
      if (isDebug()) {
        dlog(
          `angular createElement ${name} -> anchor host ${describeHost(anchor)}`,
        );
      }
      return anchor;
    }

    const descriptor = descriptorFor(engineName);
    // The tag, not just the resolved Fabric name: the host-behavior registry is keyed by the
    // INTRINSIC tag (host-behavior.ts's own comment), and a node only ever carries the resolved
    // name afterward. Omitting this argument means attachHostBehavior looks up the WRONG key
    // (e.g. 'RCTView') and any registered behavior silently never attaches — Vue's renderer
    // already passes this correctly (`createElement(descriptor.component, descriptor.isText, type)`).
    const node = createElement(
      descriptor.component,
      descriptor.isText,
      engineName,
    );
    if (isDebug()) {
      dlog(`angular createElement ${name} -> ${descriptor.component}`);
    }
    if (READ_BACK_TAGS.has(engineName)) markReadBackNode(node);
    return toPublicInstance(node);
  }

  createComment(): IHostNode {
    // Angular structural directives (*ngIf / @if / @for) need anchor nodes to track
    // position. A real retained node the commit walk SKIPS — no native view. Twin of the
    // Vue createComment path.
    countAngular('nodesCreated');
    const anchor = tagAnchorForDebug(createAnchor());
    if (isDebug()) {
      dlog(`Angular renderer createComment -> ${describeHost(anchor)}`);
    }
    return anchor;
  }

  createText(value: string): IHostNode {
    countAngular('nodesCreated');
    return createRawText(value);
  }

  appendChild(parent: IHostElement | null, newChild: IHostNode): void {
    // Angular defers insertion for content awaiting its host component's own projection
    // (see parentNode below) — mirrors Angular's own `if (parentRNode !== null)` guard in
    // addLViewToLContainer: skip silently now, the later projection pass places it correctly.
    if (parent === null) return;
    countAngular('nodesInserted');
    assertTextPlacement(newChild, parent);
    if (isSurface(parent)) {
      if (isDebug()) {
        dlog(
          `Angular renderer appendChild parent=surface child=${describeHost(newChild)}`,
        );
      }
      parent.appendChild(newChild);
    } else {
      // The engine's own `appendChild` already redirects through `parent.childHost` when the
      // primitive's behavior builds one (ScrollView's content node, e.g.) — the adapter-side
      // projection bridge this used to route through is gone with the ScrollView component.
      if (isDebug()) {
        dlog(
          `Angular renderer appendChild parent=${describeHost(parent)} child=${describeHost(newChild)}`,
        );
      }
      appendChild(parent, newChild);
    }
    this.surface.requestCommit();
  }

  insertBefore(
    parent: IHostElement | null,
    newChild: IHostNode,
    refChild: IHostNode | null,
  ): void {
    if (parent === null) return; // see the appendChild guard above
    countAngular('nodesInserted');
    assertTextPlacement(newChild, parent);
    if (isSurface(parent)) {
      if (isDebug()) {
        dlog(
          `Angular renderer insertBefore parent=surface child=${describeHost(newChild)} ref=${refChild ? describeHost(refChild) : 'null'}`,
        );
      }
      if (refChild) parent.insertBefore(newChild, refChild);
      else parent.appendChild(newChild);
    } else {
      if (isDebug()) {
        dlog(
          `Angular renderer insertBefore parent=${describeHost(parent)} child=${describeHost(newChild)} ref=${refChild ? describeHost(refChild) : 'null'}`,
        );
      }
      if (refChild) insertBefore(parent, newChild, refChild);
      else appendChild(parent, newChild);
    }
    this.surface.requestCommit();
  }

  removeChild(_parent: IHostElement | null, oldChild: IHostNode): void {
    // Detach from the child's own retained parent (a top-level node lives in
    // surface.children with no parent). Angular's `parent` arg is ignored in favor of the
    // authoritative link, mirroring the Vue adapter's remove.
    // Angular tears down a root view by removing its HOST, which here is the surface itself. There
    // is nothing above it to detach from — the old retained tree absorbed the call (`indexOf` of a
    // node that is not in the list is -1), and the mutation buffer cannot: it would record a remove
    // naming the surface as a child of its own node.
    if (isSurface(oldChild)) return;
    countAngular('nodesRemoved');
    if (isDebug()) {
      const angularParent = _parent !== null ? describeHost(_parent) : 'null';
      const retainedParent =
        parentOf(oldChild) !== undefined
          ? describeHost(parentOf(oldChild))
          : 'none';
      dlog(
        `Angular renderer removeChild angularParent=${angularParent} retainedParent=${retainedParent} child=${describeHost(oldChild)}`,
      );
    }
    const parent = parentOf(oldChild);
    if (parent !== undefined) removeChild(parent, oldChild);
    else this.surface.removeChild(oldChild);
    this.surface.requestCommit();
  }

  // FlatList/VirtualizedList cells are content projected into a component host (our
  // ANCHOR_HOST_COMPONENTS, e.g. ScrollView) — Angular's own addLViewToLContainer
  // (.vendors/angular node_manipulation.ts/container.ts) treats a null parent here as "defer —
  // the child component's own <ng-content>/ɵɵprojection will place this once its structure
  // resolves" (e.g. ScrollView's `@if(isHorizontal)` branch). Renderer2's contract types this
  // return as nullable for exactly that reason; returning `this.surface` as a non-null fallback
  // defeated that defer check and caused premature top-level insertion (2026-07: FlatList cells
  // rendered outside their ScrollView).
  //
  // Safe only because appendChild/insertBefore above now also treat a null parent as "skip, wait
  // for projection" — a second Angular call site (`insertAnchorNode`, hit whenever a directive
  // does `inject(ViewContainerRef)`, e.g. VListOutletDirective) forwards this null straight into
  // insertBefore without checking it; without that guard it crashed on-device.
  parentNode(node: IHostNode): IHostElement | null {
    return parentOf(node) ?? null;
  }

  nextSibling(node: IHostNode): IHostNode | null {
    // `?? null` because Renderer2 types the miss as null; the engine answers undefined
    // uniformly and owns the top-level fallback through the surface it is handed.
    return nextSiblingOf(node, this.surface) ?? null;
  }

  // locateHostElement always routes createComponent's `hostElement` THROUGH here as
  // `selectorOrNode` (Angular's own core.mjs) — it is never bypassed just because a real
  // object (vs. a selector string) was given. A string only reaches us on the (unused here)
  // selector-string bootstrap path, so the surface is the fallback for that case only.
  selectRootElement(selectorOrNode: string | IHostElement): IHostElement {
    return typeof selectorOrNode === 'string' ? this.surface : selectorOrNode;
  }

  // The three prop writers below close the styling run FIRST. A read or a commit would do it through
  // `registerBeforeFlush`, but neither happens here: this is one prop write landing on the same node
  // whose `style` or `class` is still held, and a run published afterwards would overwrite it.
  setAttribute(el: IHostElement, name: string, value: string): void {
    if (isSurface(el)) return;
    this.flushStyling();
    countAngular('rendererWrites');
    noteAngularWrite(name);
    routeProp(el, name, value);
    this.surface.requestCommit();
  }

  removeAttribute(el: IHostElement, name: string): void {
    if (isSurface(el)) return;
    this.flushStyling();
    countAngular('rendererWrites');
    noteAngularWrite(name);
    routeProp(el, name, undefined);
    this.surface.requestCommit();
  }

  // Ivy compiles every class= / [class.foo] / [ngClass] form down to per-token addClass/
  // removeClass calls (never a single setAttribute('class', ...) call), so a per-node token set
  // is accumulated here and re-joined into one string on every change, then handed to
  // routeProp('class', ...) exactly like Vue's template `class="..."` and React's JSX
  // `className="..."` — all three resolve through the SAME centralized class+style merge in
  // core/engine/src/node.ts, so a class registered via the SFC/CSS-Modules style compiler
  // resolves identically regardless of adapter.
  private readonly classTokens = new WeakMap<IHostNode, Set<string>>();

  // The OTHER class source: a whole string written as a prop. Kept apart from the token set rather
  // than merged into it, because the two are replaced independently — a new `[class]` value
  // replaces this string entirely while leaving every `[class.foo]` token standing.
  private readonly classStrings = new WeakMap<IHostNode, string>();
  private readonly callbackWrappers = new WeakMap<
    IHostNode,
    ICallbackWrapper
  >();

  addClass(el: IHostElement, name: string): void {
    if (isSurface(el)) return;
    countAngular('rendererWrites');
    noteAngularWrite('class');
    const tokens = this.classTokens.get(el) ?? new Set<string>();
    tokens.add(name);
    this.classTokens.set(el, tokens);
    this.openClassRun(el);
    this.surface.requestCommit();
  }

  removeClass(el: IHostElement, name: string): void {
    if (isSurface(el)) return;
    const tokens = this.classTokens.get(el);
    if (tokens === undefined) return;
    countAngular('rendererWrites');
    noteAngularWrite('class');
    tokens.delete(name);
    this.openClassRun(el);
    this.surface.requestCommit();
  }

  // The token SET is the accumulator here — `addClass` has already put the token in it — so this
  // only has to remember whose run is open. Closing it re-joins the set once.
  private openClassRun(el: ISymbioteNode): void {
    if (this.pendingClassNode === el) return;
    this.flushStyling();
    this.pendingClassNode = el;
  }

  // Angular decomposes a [style] binding into per-key setStyle calls (ɵɵstyleMap). RN wants
  // the whole style object as one `style` prop, so merge each key into it — onto the explicit
  // style half tracked by routeProp's centralized class+style merge (core/engine/src/node.ts),
  // NOT el.props.style directly: that may now be the [classStyle, explicitStyle] array the
  // merge writes, and spreading an array as a record would silently produce numeric-index keys.
  setStyle(el: IHostElement, style: string, value: unknown): void {
    if (isSurface(el)) return;
    countAngular('rendererWrites');
    noteAngularStyleWrite(style);
    this.writeStyle(el, style, value);
    this.surface.requestCommit();
  }

  removeStyle(el: IHostElement, style: string): void {
    if (isSurface(el)) return;
    // A remove on a node with no style at all is Angular clearing a binding it never set. Opening a
    // run for it would publish an empty style onto a node that had none, which the old early return
    // was there to avoid.
    if (this.pendingStyleNode !== el && !isRecord(getExplicitStyle(el))) return;
    countAngular('rendererWrites');
    noteAngularStyleWrite(style);
    const run = this.openStyleRun(el);
    // The accumulator is this renderer's own object, never the node's — see `openStyleRun`.

    delete run[style];
    this.surface.requestCommit();
  }

  // [prop]="x" bindings. routeProp makes the prop-vs-event decision from the node's
  // ViewConfig (identical to React/Vue), so the whole flat-bag prop layer is shared.
  setProperty(el: IHostElement, name: string, value: unknown): void {
    if (isSurface(el)) return;
    countAngular('rendererWrites');
    noteAngularWrite(name);
    // A WHOLE CLASS STRING IS NOT AN ORDINARY PROP: it is one of two sources the node's class list
    // is built from, and writing it straight through would erase every `[class.foo]` token the
    // other one put there. It joins the class run instead, exactly as `addClass` does.
    if (name === 'class') {
      this.openClassRun(el);
      this.classStrings.set(el, typeof value === 'string' ? value : '');
      this.surface.requestCommit();
      return;
    }
    // `ngOnChanges` routes every `[onValueChange]` write here (both the initial bind and any
    // later rebind to a new function reference) — never through `listen()`. When the write is a
    // genuinely explicit app handler (not a prior bridge's own forward function), update the live
    // slot `composeValueChangeHandler`'s forward function reads on every event; when a bridge is
    // already installed on this node, that's ALL that's needed — the installed forward function
    // picks the new handler up on its own, no re-route. Without this, a rebind after mount would
    // silently kill the `[(value)]` two-way sync the moment it overwrote the composed prop raw.
    if (name === VALUE_CHANGE_PROP) {
      if (isReadBackListener(value) && !bridgedValueChangeHandlers.has(value)) {
        explicitValueChangeHandlers.set(el, value);
      } else {
        explicitValueChangeHandlers.delete(el);
      }
      const current = propOf(el, VALUE_CHANGE_PROP);
      const bridgeActive =
        isReadBackListener(current) && bridgedValueChangeHandlers.has(current);
      if (bridgeActive) {
        this.surface.requestCommit();
        return;
      }
    }
    this.flushStyling();
    // `[styleProp]` IS `style`, carried as a plain property so an RN array or press-state callback
    // reaches the engine whole instead of Angular's styling engine. Binding it beside `[style]` on one
    // element makes the later write win - they are one prop.
    const propName = name === STYLE_PROP_BINDING ? 'style' : name;
    routeProp(el, propName, this.wrapCallback(el, propName, value));
    this.surface.requestCommit();
  }

  // AN `on*` PROP IS CALLED BY THE ENGINE, so Angular is told nothing and a plain field mutation
  // inside the app's handler dirties no view — the "pan readout stuck at dx 0" bug
  // `change-detection-flush.ts` records. It used to be wrapped by `SymbioteElement.ngOnChanges`,
  // which is the wrong place now that most element directives are withheld from runtime matching
  // (`../runtime-matching`): a withheld tag's binding reaches the renderer DIRECTLY through
  // `ɵɵproperty` and never passes through a directive at all.
  //
  // Here it is reached by both paths and by every adapter surface — an element binding, a composed
  // component's flat bag, an imperative write — which is a better home than the one it left.
  //
  // The cache is per NODE rather than per caller, because a node is what both paths agree on, and the
  // wrapper is built on the first callback a node receives: the overwhelming majority of tags carry
  // no `on*` prop, and an eager one would be a closure and a `WeakMap` per element for nothing.
  private wrapCallback(node: IHostNode, name: string, value: unknown): unknown {
    if (!isWrappableCallback(name, value)) return value;
    let wrapper = this.callbackWrappers.get(node);
    if (wrapper === undefined) {
      wrapper = createCallbackWrapper(node);
      this.callbackWrappers.set(node, wrapper);
    }
    return wrapper(name, value);
  }

  setValue(node: IHostNode, value: string): void {
    countAngular('rendererWrites');
    noteAngularWrite('#text');
    // A useful permanent seam: text mutations are low-frequency and the one place a stale
    // `{{binding}}` (a change-detection gap) shows up as "the setValue never fired".
    if (isDebug()) {
      dlog(`Angular renderer setValue "${value}" on ${describeHost(node)}`);
    }
    setText(node, value);
    this.surface.requestCommit();
  }

  // (event)="x" bindings. Angular hands the event name EXPLICITLY (no onX->x inference),
  // so we drive the engine's structural event channel directly — the path setEventListener
  // in core/engine/src/node.ts already names "Angular Renderer2.listen" for. Global targets
  // (window/document/body) have no Fabric node, so they no-op.
  listen(
    target: unknown,
    eventName: string,
    callback: (event: unknown) => boolean | void,
  ): () => void {
    if (!isSymbioteNode(target)) return () => {};
    // `[(value)]` desugars to `(valueChange)`, which is the spelling every Angular template writes
    // for a Switch or a TextInput. It used to be an `@Output()` a wrapper derived from the raw
    // `change` payload; a tag has no component, and registering `valueChange` as an engine event
    // would wait forever for a Fabric event of that name.
    //
    // The same fold already exists under RN's own spelling: both behaviors call
    // `node.props.onValueChange(event)` — a plain function PROP, not an event
    // (`behaviors/switch.ts`, `behaviors/text-input.ts`), with `text`/`value` carried as a FIELD on
    // the event object rather than a second argument (Svelte forces every individual `on*` prop
    // through a native listener that calls with exactly one argument, always a real object). So
    // Angular's own `[(value)]` sugar needs one extra step its React/Vue/Solid counterparts do not:
    // unwrap that field back to a bare value before handing it to Angular's callback, or `text =
    // $event` would assign the whole event object instead of the typed string/boolean.
    if (eventName === VALUE_CHANGE_EVENT) {
      // `ngOnChanges` may already have written an explicit `[onValueChange]` binding onto this
      // same prop key via `routeProp` (`setProperty`'s generic reflect loop) — seed the live
      // explicit-handler slot from it, unless what's there is a PRIOR bridge's own forward
      // function (the Angular-vs-manual-bridge double-registration this branch already dedupes,
      // `listen(VALUE_CHANGE_EVENT)` fires twice per element — see `bridgedValueChangeHandlers`).
      // Composing with the explicit handler (never replacing it) is the RN-parity behavior: RN's
      // `onChange` always fires regardless of whether `value` is controlled.
      const currentOnValueChange = propOf(target, VALUE_CHANGE_PROP);
      if (
        isReadBackListener(currentOnValueChange) &&
        !bridgedValueChangeHandlers.has(currentOnValueChange)
      ) {
        explicitValueChangeHandlers.set(target, currentOnValueChange);
      }
      routeProp(
        target,
        VALUE_CHANGE_PROP,
        composeValueChangeHandler(target, callback),
      );
      return () =>
        routeProp(
          target,
          VALUE_CHANGE_PROP,
          explicitValueChangeHandlers.get(target),
        );
    }
    const listener = READ_BACK_EVENTS.has(eventName)
      ? withChangeDetection(target, callback)
      : callback;
    setEventListener(target, eventName, listener);
    return () => setEventListener(target, eventName, undefined);
  }
}

// Provided to Angular as RendererFactory2; createRenderer returns the single
// surface-bound renderer for every component (begin/end commit-coalescing is unnecessary —
// requestCommit already microtask-coalesces).
export class SymbioteRendererFactory implements RendererFactory2 {
  private renderer: SymbioteRenderer | undefined;

  constructor(private readonly surface: SymbioteSurface) {}

  createRenderer(
    _hostElement: unknown,
    _type: RendererType2 | null,
  ): Renderer2 {
    return (this.renderer ??= new SymbioteRenderer(this.surface));
  }

  /**
   * The surface is being torn down, so the one renderer it shares can stop listening.
   *
   * IT IS THE FACTORY'S JOB and not Angular's, because the instance outlives any single component:
   * Angular's own `Renderer2.destroy()` arrives once per destroyed component and must not close a
   * door every surviving view still writes through. See `SymbioteRenderer.destroy`.
   */
  dispose(): void {
    this.renderer?.dispose();
    this.renderer = undefined;
  }

  // Not commit coalescing (requestCommit owns that) — a per-CD-pass counter only, now that the
  // ScrollView projection bridge this used to also flush is gone (`../register.ts`'s
  // `registerScrollViewBehavior` owns the content node and the sticky seam for every adapter).
  end(): void {
    countAngular('cdPasses');
  }
}
