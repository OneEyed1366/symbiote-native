// The one shape every retained node has, and the factories that mint it

import type {
  IMeasureOnSuccess,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
} from './fabric';
import {
  recordCreateAnchor,
  recordCreateVoid,
  recordCreateElement,
  recordCreateRawText,
  recordSetComponent,
  recordSetProp,
} from './mutation-buffer';
import {
  attachHostBehavior,
  hasHostBehaviors,
  type IHostBehavior,
  type IPayloadFold,
} from './host-behavior';
import { configPayloadFold } from './registry';
import { dlog } from './debug';
// A cycle, deliberately: `imperative.ts` imports this module and the prototype methods below call
// back into it. Neither touches the other at module-evaluation time, only inside a function body
import {
  measure as engineMeasure,
  measureInWindow as engineMeasureInWindow,
  measureLayout as engineMeasureLayout,
  setNativeProps as engineSetNativeProps,
  dispatchViewCommand,
} from './imperative';
import {
  ANCHOR_COMPONENT,
  BRAND,
  RAW_TEXT_COMPONENT,
  SURFACE_COMPONENT,
  VOID_COMPONENT,
  isSymbioteNode,
  type IClassStyleParts,
  type IEventDispatch,
  type IListener,
  type ISymbioteNode,
} from './node-types';

const FOCUS_COMMAND = 'focus';
const BLUR_COMMAND = 'blur';
// Names and arg order mirror RN's `ScrollViewCommands`
const SCROLL_TO_COMMAND = 'scrollTo';
const SCROLL_TO_END_COMMAND = 'scrollToEnd';
const FLASH_SCROLL_INDICATORS_COMMAND = 'flashScrollIndicators';

// A class, so the imperative methods share a prototype instead of being allocated per node, and
// both factories below mint the same hidden class. Fields are `declare`d and assigned in the
// constructor, the shape V8 and Hermes handle best
class SymbioteNode implements ISymbioteNode {
  declare readonly [BRAND]: true;
  declare component: string;
  declare readonly isText: boolean;
  declare listeners: Map<string, IListener> | undefined;
  declare dispatch: IEventDispatch | undefined;
  declare hasCommitHook: boolean;
  declare resolvesImageSources: boolean;
  declare nativeIdWinsOverId: boolean;
  declare styleParts: IClassStyleParts | undefined;
  declare payloadFold: IPayloadFold | undefined;
  declare hostBehavior: IHostBehavior | undefined;
  declare childHost: ISymbioteNode | undefined;
  declare wrapper: ISymbioteNode | undefined;
  declare mayHaveChildren: boolean;
  declare isTornDown: boolean;
  declare slot: number;
  declare slotBatch: number;

  constructor(component: string, isText: boolean) {
    // Every field is assigned here, not lazily: present from the constructor, they all keep ONE
    // hidden class for every node
    this[BRAND] = true;
    this.component = component;
    this.isText = isText;
    this.listeners = undefined;
    this.dispatch = undefined;
    this.hasCommitHook = false;
    this.resolvesImageSources = false;
    this.nativeIdWinsOverId = false;
    this.styleParts = undefined;
    this.payloadFold = undefined;
    this.hostBehavior = undefined;
    this.childHost = undefined;
    this.wrapper = undefined;
    this.mayHaveChildren = false;
    this.isTornDown = false;
    // `slotOf` reads this pair on EVERY handle operand of every op, so both must be stable slots.
    // `slotBatch` starts at a value no real batch carries, so an untouched node needs no flag
    this.slot = 0;
    this.slotBatch = 0;
  }

  measure(callback: IMeasureOnSuccess): void {
    engineMeasure(this, callback);
  }

  measureInWindow(callback: IMeasureInWindowOnSuccess): void {
    engineMeasureInWindow(this, callback);
  }

  measureLayout(
    relativeToNativeNode: ISymbioteNode | number,
    onSuccess: IMeasureLayoutOnSuccess,
    onFail?: () => void,
  ): void {
    if (!isSymbioteNode(relativeToNativeNode)) {
      dlog('measureLayout: relative target must be a host ref');
      return;
    }
    engineMeasureLayout(this, relativeToNativeNode, onSuccess, onFail);
  }

  setNativeProps(nativeProps: Record<string, unknown>): void {
    engineSetNativeProps(this, nativeProps);
  }

  focus(): void {
    dispatchViewCommand(this, FOCUS_COMMAND, []);
  }

  blur(): void {
    dispatchViewCommand(this, BLUR_COMMAND, []);
  }

  // The defaults live HERE and nowhere else, so `buildScrollViewHandle` delegating here cannot
  // drift on what `scrollTo()` with no argument means
  scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void {
    const x = options?.x ?? 0;
    const y = options?.y ?? 0;
    const animated = options?.animated ?? true;
    dlog(`ScrollView.scrollTo x=${x} y=${y} animated=${animated}`);
    dispatchViewCommand(this, SCROLL_TO_COMMAND, [x, y, animated]);
  }

  scrollToEnd(options?: { animated?: boolean }): void {
    const animated = options?.animated ?? true;
    dlog(`ScrollView.scrollToEnd animated=${animated}`);
    dispatchViewCommand(this, SCROLL_TO_END_COMMAND, [animated]);
  }

  flashScrollIndicators(): void {
    dlog('ScrollView.flashScrollIndicators');
    dispatchViewCommand(this, FLASH_SCROLL_INDICATORS_COMMAND, []);
  }
}

// Mint an element and record its creation. The node object IS the handle: what the ops address,
// what the host attaches its native node to, and what Fabric hands back as an event target
export function createElement(
  component: string,
  isText = false,
  // The intrinsic tag this node came from, when it differs from the Fabric view name above. The
  // behavior registry is keyed by tag, so an adapter creating `<pressable>` must hand it over
  tag: string = component,
): ISymbioteNode {
  const node = new SymbioteNode(component, isText);
  // A primitive that commits NO VIEW resolves to the anchor component through `descriptorFor`, and
  // a primitive whose ENTIRE subtree must vanish resolves to the void one the same way
  if (component === ANCHOR_COMPONENT) recordCreateAnchor(node);
  else if (component === VOID_COMPONENT) recordCreateVoid(node);
  else recordCreateElement(node, component, isText, node);
  // Gated on the boolean, not on the `Map`: this runs ~9 000 times per benchmark create, and an app
  // that registers nothing must pay one boolean read rather than a hash lookup per node
  if (hasHostBehaviors()) attachHostBehavior(node, tag);

  // A third-party view's own ViewConfig processors, as a fold, AFTER the behavior's: the behavior
  // rewrites wrapper-body props and `validAttributes[*].process` then converts what it produced
  const configFold = configPayloadFold(component);
  if (configFold !== undefined) {
    const behaviorFold = node.payloadFold;
    node.payloadFold =
      behaviorFold === undefined
        ? configFold
        : props => configFold(behaviorFold(props));
  }
  return node;
}

// `tag` mirrors `createElement`'s, т.к. a raw text's CONTENT can still be a function of the
// platform (Button renders its title uppercased on Android) even with no props an app can write
export function createRawText(
  text: string,
  tag: string = RAW_TEXT_COMPONENT,
): ISymbioteNode {
  const node = new SymbioteNode(RAW_TEXT_COMPONENT, false);
  recordCreateRawText(node, text);
  // TAG check first, not `hasHostBehaviors()`: almost no raw text is tagged, so an untagged one
  // pays a pointer-equality compare against the default rather than a registry lookup
  if (tag !== RAW_TEXT_COMPONENT && hasHostBehaviors())
    attachHostBehavior(node, tag);
  return node;
}

// A `WeakMap` cannot be logged, so this gives every node a small human-readable id assigned lazily,
// which lets a `dlog` at ref-attach time and one at dispatch time prove they are the SAME object
const debugIds = new WeakMap<ISymbioteNode, number>();
let nextDebugId = 1;
export function debugNodeId(node: ISymbioteNode): number {
  let id = debugIds.get(node);
  if (id === undefined) {
    id = nextDebugId++;
    debugIds.set(node, id);
  }
  return id;
}

export function createAnchor(): ISymbioteNode {
  const node = new SymbioteNode(ANCHOR_COMPONENT, false);
  recordCreateAnchor(node);
  return node;
}

export function createVoid(): ISymbioteNode {
  const node = new SymbioteNode(VOID_COMPONENT, false);
  recordCreateVoid(node);
  return node;
}

// One persistent root view per surface, mirroring RN's own `AppContainer`. Not decoration: without
// `flex: 1` a non-flex root collapses to content height, and without `box-none` a touch outside the
// app has no escape
export function createSurfaceRoot(): ISymbioteNode {
  const node = new SymbioteNode(SURFACE_COMPONENT, false);
  recordCreateElement(node, 'RCTView', false, node);
  // Recorded straight, not through `routeProp`: these are literal Fabric props, not props an app
  // authored, so they want none of the class merging or event routing that path exists for
  recordSetProp(node, 'style', { flex: 1 });
  recordSetProp(node, 'pointerEvents', 'box-none');
  return node;
}

// Change which Fabric view a node commits as, keeping the node's identity. Both the JS field and
// the op move, т.к. no prop write moves a node between views and the host must re-create it
export function setNodeComponent(node: ISymbioteNode, component: string): void {
  if (node.component === component) return;
  node.component = component;
  recordSetComponent(node, component);
}
