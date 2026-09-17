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
  nextSiblingOf,
  parentOf,
  removeChild,
  routeProp,
  setEventListener,
  setProp,
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
import { foldHostBag } from '@symbiote-native/components/fold-host-bag';
import type { Renderer2, RendererFactory2, RendererType2 } from '@angular/core';
import { isAnchorHostComponent } from '../anchor-host-registry';
import {
  countAngular,
  noteAngularCreate,
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

// RN's Text.js applies two defaults on the way to native (core/components/host-primitives.cjs's
// `Text.defaults`; the authority on what they MEAN is core/components/src/text-props.ts's
// resolveTextProps, which the composed `Text` @Component already calls). That component's own
// host paints directly (Text is not anchor-hosted — see the top-level "View/Text's own component
// doesn't have this split" reasoning elsewhere in this file), so createElement runs for its INNER
// text node too; seeding here therefore covers both the composed Text and a bare `text` tag,
// uniformly. Found missing 2026-08-31 (a cross-adapter key-count diff against Vue's real
// BenchmarkRow.vue) — without this a `text`'s
// `numberOfLines` clips with no ellipsis, silently, on device only. Vue's renderer already does
// this (`adapters/vue/src/renderer/index.ts`'s `seedTextDefaults`); Angular's simply never did.
//
// Sourced from `foldHostBag` (`@symbiote-native/components/fold-host-bag`, driven by
// `HOST_PRIMITIVES.Text.defaults`) rather than a second hardcoded copy — React and Svelte call the
// same function directly; this used to be a THIRD, independent restatement of the same two
// defaults, with nothing to catch it drifting from the spec if a default's value ever changed.
// `foldHostBag('text', {})` on an EMPTY bag folds every default with no authored value to
// override it (the alias loop has nothing to fold — `id` is only rewritten when present), which is
// exactly the seed this function needs.
// THE SEED IS GONE — the defaults come from the payload builder now (`applyTextDefaults` in
// `core/engine/src/fabric-props.ts` and its twin in `SymbioteFabricProps.cpp`). Writing them as props
// cost a crossing every time the app authored the same value: 6 000 per 1 000-row create, measured
// with `writesOfUnchanged`. The clear-back-to-undefined path below stays — it is off the create path
// and costs nothing on the common one.

// An explicit `undefined` must NOT clear one of those defaults — RN treats a missing prop and an
// explicit undefined alike, and only a literal `false` opts allowFontScaling out. Reached only
// when a later write clears a key back to undefined, so it costs nothing on the common path.
// `foldHostBag` folds every Text default when called this way (not just `key`), because its
// contract is "fold a whole bag" — the extra key computed alongside `key` is simply unread here.
function textDefaultFor(el: IHostElement, key: string): unknown {
  if (isSurface(el) || !isTextContainer(el)) return undefined;
  return foldHostBag('text', { [key]: undefined })[key];
}

// `PROP_ALIASES` (`id` -> `nativeID`) left this renderer on 2026-09-18 — `routeProp` resolves it
// for every adapter now, so every path that can set a prop still reaches it.
// Angular's two-way sugar `[(value)]` compiles to a `(valueChange)` binding; the engine knows the
// same fold as the function prop `onValueChange`. See `listen()`. The two names live in a leaf
// module so `elements.ts`'s ControlValueAccessor can name them without importing this cyclic file.
import { VALUE_CHANGE_EVENT, VALUE_CHANGE_PROP } from './value-change';
import { flushViewFor } from '../change-detection-flush';

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

type IReadBackListener = (event: unknown) => unknown;

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

  constructor(private readonly surface: SymbioteSurface) {}

  destroy(): void {}

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

  setAttribute(el: IHostElement, name: string, value: string): void {
    if (isSurface(el)) return;
    countAngular('rendererWrites');
    noteAngularWrite(name);
    routeProp(el, name, value);
    this.surface.requestCommit();
  }

  removeAttribute(el: IHostElement, name: string): void {
    if (isSurface(el)) return;
    countAngular('rendererWrites');
    noteAngularWrite(name);
    routeProp(el, name, textDefaultFor(el, name));
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

  addClass(el: IHostElement, name: string): void {
    if (isSurface(el)) return;
    countAngular('rendererWrites');
    noteAngularWrite('class');
    const tokens = this.classTokens.get(el) ?? new Set<string>();
    tokens.add(name);
    this.classTokens.set(el, tokens);
    routeProp(el, 'class', [...tokens].join(' '));
    this.surface.requestCommit();
  }

  removeClass(el: IHostElement, name: string): void {
    if (isSurface(el)) return;
    const tokens = this.classTokens.get(el);
    if (tokens === undefined) return;
    countAngular('rendererWrites');
    noteAngularWrite('class');
    tokens.delete(name);
    routeProp(el, 'class', tokens.size > 0 ? [...tokens].join(' ') : undefined);
    this.surface.requestCommit();
  }

  // Angular decomposes a [style] binding into per-key setStyle calls (ɵɵstyleMap). RN wants
  // the whole style object as one `style` prop, so merge each key into it — onto the explicit
  // style half tracked by routeProp's centralized class+style merge (core/engine/src/node.ts),
  // NOT el.props.style directly: that may now be the [classStyle, explicitStyle] array the
  // merge writes, and spreading an array as a record would silently produce numeric-index keys.
  setStyle(el: IHostElement, style: string, value: unknown): void {
    if (isSurface(el)) return;
    countAngular('rendererWrites');
    noteAngularWrite(`style.${style}`);
    const current = getExplicitStyle(el);
    const base = isRecord(current) ? current : {};
    routeProp(el, 'style', { ...base, [style]: value });
    this.surface.requestCommit();
  }

  removeStyle(el: IHostElement, style: string): void {
    if (isSurface(el)) return;
    const current = getExplicitStyle(el);
    if (!isRecord(current)) return;
    countAngular('rendererWrites');
    noteAngularWrite(`style.${style}`);
    const { [style]: _removed, ...rest } = current;
    routeProp(el, 'style', rest);
    this.surface.requestCommit();
  }

  // [prop]="x" bindings. routeProp makes the prop-vs-event decision from the node's
  // ViewConfig (identical to React/Vue), so the whole flat-bag prop layer is shared.
  setProperty(el: IHostElement, name: string, value: unknown): void {
    if (isSurface(el)) return;
    countAngular('rendererWrites');
    noteAngularWrite(name);
    routeProp(el, name, value === undefined ? textDefaultFor(el, name) : value);
    this.surface.requestCommit();
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
      const forwardValue = withChangeDetection(target, (event: unknown) => {
        if (isSymbioteEvent(event)) {
          if ('text' in event) return callback(event.text);
          if ('value' in event) return callback(event.value);
        }
        return callback(event);
      });
      routeProp(target, VALUE_CHANGE_PROP, forwardValue);
      return () => routeProp(target, VALUE_CHANGE_PROP, undefined);
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

  // Not commit coalescing (requestCommit owns that) — a per-CD-pass counter only, now that the
  // ScrollView projection bridge this used to also flush is gone (`../register.ts`'s
  // `registerScrollViewBehavior` owns the content node and the sticky seam for every adapter).
  end(): void {
    countAngular('cdPasses');
  }
}
