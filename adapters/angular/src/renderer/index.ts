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
import { descriptorFor } from '@symbiote-native/components';
import { foldHostBag } from '@symbiote-native/components/fold-host-bag';
import type { Renderer2, RendererFactory2, RendererType2 } from '@angular/core';
import { isAnchorHostComponent } from '../anchor-host-registry';
import {
  countAngular,
  noteAngularCreate,
  noteAngularWrite,
} from '../diagnostics';
import {
  flushScrollViewProjections,
  getScrollViewProjection,
  removeScrollViewProjectedChild,
} from '../components/scroll-view/projection';

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
// symbiote-text node too; seeding here therefore covers both the composed Text and any bare
// `symbiote-text` a future lowering emits, uniformly. Found missing 2026-08-31 (a cross-adapter
// key-count diff against Vue's real BenchmarkRow.vue) — without this a lowered Text's
// `numberOfLines` clips with no ellipsis, silently, on device only. Vue's renderer already does
// this (`adapters/vue/src/renderer/index.ts`'s `seedTextDefaults`); Angular's simply never did.
//
// Sourced from `foldHostBag` (`@symbiote-native/components/fold-host-bag`, driven by
// `HOST_PRIMITIVES.Text.defaults`) rather than a second hardcoded copy — React and Svelte call the
// same function directly; this used to be a THIRD, independent restatement of the same two
// defaults, with nothing to catch it drifting from the spec if a default's value ever changed.
// `foldHostBag('symbiote-text', {})` on an EMPTY bag folds every default with no authored value to
// override it (the alias loop has nothing to fold — `id` is only rewritten when present), which is
// exactly the seed this function needs.
function seedTextDefaults(node: ISymbioteNode): void {
  const seeded = foldHostBag('symbiote-text', {});
  for (const [key, value] of Object.entries(seeded)) setProp(node, key, value);
}

// An explicit `undefined` must NOT clear one of those defaults — RN treats a missing prop and an
// explicit undefined alike, and only a literal `false` opts allowFontScaling out. Reached only
// when a later write clears a key back to undefined, so it costs nothing on the common path.
// `foldHostBag` folds every Text default when called this way (not just `key`), because its
// contract is "fold a whole bag" — the extra key computed alongside `key` is simply unread here.
function textDefaultFor(el: IHostElement, key: string): unknown {
  if (isSurface(el) || !isTextContainer(el)) return undefined;
  return foldHostBag('symbiote-text', { [key]: undefined })[key];
}

// RN's `id` is the modern W3C-named alias for `nativeID` (core/components/host-primitives.cjs's
// `ID_ALIAS`) — View.js/Text.js copy it over unconditionally, so the two name ONE native prop.
// React/Solid/Svelte fold it in a wrapper or transform; Angular had it nowhere, so `<View
// id="x">`/`[id]="x"` reached Fabric with an unknown `id` key and no `nativeID` — silently, on
// device only. Lives in the renderer (mirroring Vue's `PROP_ALIASES`) so it covers every path
// that can set a prop — `setAttribute`, `setProperty`, and (should a future lowering emit one) a
// hand-built call — not just the composed component's own `id` @Input.
// `symbioteStyle` is what the lowering transform emits in place of `[style]`: Angular routes a
// `style` binding to its own CSS styling engine, which cannot represent an RN StyleProp (an array
// throws inside change detection). Under any other name it is an ordinary property binding and
// arrives here.
// Angular's two-way sugar `[(value)]` compiles to a `(valueChange)` binding; the engine knows the
// same fold as the function prop `onValueChange`. See `listen()`.
const VALUE_CHANGE_EVENT = 'valueChange';
const VALUE_CHANGE_PROP = 'onValueChange';

const PROP_ALIASES: ReadonlyMap<string, string> = new Map([
  ['id', 'nativeID'],
  ['symbioteStyle', 'style'],
]);

function aliasedPropName(name: string): string {
  return PROP_ALIASES.get(name) ?? name;
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

const PRIMITIVE_SELECTOR_ALIAS: Record<string, string> = {
  // Public ergonomic selectors map directly to the engine primitive descriptors.
  View: 'symbiote-view',
  Text: 'symbiote-text',
};

// The ANCHOR_HOST_COMPONENTS Set and registerComposedComponent now live in the dependency-free
// leaf module ../anchor-host-registry (imported above as isAnchorHostComponent) — see its header
// for why the registry must NOT sit in this require-cyclic renderer module.

// Inserting a bare raw-text node anywhere but inside a <Text> is invalid in Fabric (a
// stray RCTRawText would paint). Angular's ɵɵtext only ever lands text inside a <Text>,
// but guard anyway for parity with the Vue adapter and to fail loudly on a bad template.
// `removeScrollViewProjectedChild` takes a remove callback and uses it only when the child turns
// out to be projected, which almost none are — so the engine's own `removeChild` is passed by
// reference rather than wrapped in an arrow. The wrapper was allocated on EVERY removed node:
// 10 000 closures on a Clear whose engine window is 0.1 ms.
function assertTextPlacement(child: ISymbioteNode, parent: IHostElement): void {
  if (isRawText(child) && (isSurface(parent) || !isTextContainer(parent))) {
    throw new Error(
      `Text string "${textOf(child) ?? ''}" must be rendered inside a <Text>`,
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
    // `name` is the component's host tag — a symbiote intrinsic (`symbiote-view`,
    // `symbiote-text`, …), a public ergonomic alias (`View`, `Text`), or a raw Fabric view
    // name for a native leaf. Public aliases are normalized to their engine primitive name
    // before descriptor lookup. descriptorFor resolves it; an unknown `symbiote-*` is a typo,
    // any other string flows through as a raw Fabric name (events/processors derived from its
    // ViewConfig). The imperative API (measure / setNativeProps / focus) is on the node's
    // prototype, so toPublicInstance hands back the SAME identity the commit mirror keys on.
    countAngular('nodesCreated');
    noteAngularCreate(name);
    const engineName = PRIMITIVE_SELECTOR_ALIAS[name] ?? name;

    if (isAnchorHostComponent(engineName)) {
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
    if (descriptor.isText) seedTextDefaults(node);
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
      const projection = getScrollViewProjection(parent);
      if (isDebug()) {
        dlog(
          `Angular renderer appendChild parent=${describeHost(parent)} child=${describeHost(newChild)} projection=${projection !== undefined}`,
        );
      }
      if (projection !== undefined) {
        projection.appendProjectedChild(parent, newChild, (target, child) =>
          appendChild(target, child),
        );
      } else {
        appendChild(parent, newChild);
      }
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
      const projection = getScrollViewProjection(parent);
      if (isDebug()) {
        dlog(
          `Angular renderer insertBefore parent=${describeHost(parent)} child=${describeHost(newChild)} ref=${refChild ? describeHost(refChild) : 'null'} projection=${projection !== undefined}`,
        );
      }
      if (projection !== undefined) {
        projection.insertProjectedChild(
          parent,
          newChild,
          refChild,
          (target, child, before) => {
            if (before === undefined) appendChild(target, child);
            else insertBefore(target, child, before);
          },
        );
      } else if (refChild) {
        insertBefore(parent, newChild, refChild);
      } else {
        appendChild(parent, newChild);
      }
    }
    this.surface.requestCommit();
  }

  removeChild(_parent: IHostElement | null, oldChild: IHostNode): void {
    // Detach from the child's own retained parent (a top-level node lives in
    // surface.children with no parent). Angular's `parent` arg is ignored in favor of the
    // authoritative link, mirroring the Vue adapter's remove.
    countAngular('nodesRemoved');
    const wasProjected = removeScrollViewProjectedChild(oldChild, removeChild);
    if (isDebug()) {
      const angularParent = _parent !== null ? describeHost(_parent) : 'null';
      const retainedParent =
        parentOf(oldChild) !== undefined
          ? describeHost(parentOf(oldChild))
          : 'none';
      dlog(
        `Angular renderer removeChild angularParent=${angularParent} retainedParent=${retainedParent} child=${describeHost(oldChild)} viaProjection=${wasProjected}`,
      );
    }
    if (!wasProjected) {
      const parent = parentOf(oldChild);
      if (parent !== undefined) removeChild(parent, oldChild);
      else this.surface.removeChild(oldChild);
    }
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
    routeProp(el, aliasedPropName(name), value);
    this.surface.requestCommit();
  }

  removeAttribute(el: IHostElement, name: string): void {
    if (isSurface(el)) return;
    countAngular('rendererWrites');
    noteAngularWrite(name);
    const aliased = aliasedPropName(name);
    routeProp(el, aliased, textDefaultFor(el, aliased));
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
    const aliased = aliasedPropName(name);
    routeProp(
      el,
      aliased,
      value === undefined ? textDefaultFor(el, aliased) : value,
    );
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
    // for a Switch or a TextInput. On the COMPONENT path it is an `@Output()` the wrapper derives
    // from the raw `change` payload; on a LOWERED element there is no component, and registering
    // `valueChange` as an engine event would wait forever for a Fabric event of that name.
    //
    // The lowered path already carries the same fold under RN's own spelling: both behaviors call
    // `node.props.onValueChange(value, event)` — a plain function PROP, not an event
    // (`behaviors/switch.ts`, `behaviors/text-input.ts`). So this is a rename, not a mechanism:
    // route the binding to that prop and `[(value)]` behaves identically on both paths. Without it
    // the transform had to refuse to lower the two primitives whose idiomatic spelling this is.
    if (eventName === VALUE_CHANGE_EVENT) {
      routeProp(target, VALUE_CHANGE_PROP, callback);
      return () => routeProp(target, VALUE_CHANGE_PROP, undefined);
    }
    setEventListener(target, eventName, callback);
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

  // Not commit coalescing (requestCommit owns that) — this is the one moment where a ScrollView's
  // two input channels are known to be consistent: Angular has finished writing every `@Input` AND
  // the renderer has finished every projected insert/remove for this pass, while the surface's
  // commit is still only queued. Sticky projection reconciles are batched to here for both reasons;
  // see flushScrollViewProjections.
  end(): void {
    countAngular('cdPasses');
    flushScrollViewProjections();
  }
}
