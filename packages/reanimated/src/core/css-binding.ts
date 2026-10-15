import {
  bindToNode,
  getNativeTag,
  getPublishedStyle,
  keyframesNamed,
  registerPropClaim,
  registerStyleClaim,
  type ISymbioteNode,
  type IVariantBase,
} from '@symbiote-native/engine';
import {
  CSSManager,
  markNodeAsRemovable,
} from 'react-native-reanimated/src/css/native';
import type { CSSStyle } from 'react-native-reanimated/src/css/types';
import {
  isCSSCallbackProp,
  isCSSConfigProp,
  isPseudoSelectorValue,
} from 'react-native-reanimated/src/css/utils';
import { wrapperOfNode } from './shadow-node-wrapper';

type IBinding = {
  style: CSSStyle;
  callbacks: Record<string, unknown>;
  manager: CSSManager | undefined;
};

// `{ default, ':hover': … }` is served here and the host paints the `default`
function variantsOfPseudoValue(value: unknown): IVariantBase | undefined {
  if (!isPseudoSelectorValue(value)) return undefined;
  return { base: value.default };
}

function isCssStylePart(part: unknown): part is Record<string, unknown> {
  return typeof part === 'object' && part !== null && !('initial' in part);
}

// A style part is a record, an array of parts, or nothing; an animated handle is not CSS
function flatten(part: unknown, into: Record<string, unknown>): void {
  if (Array.isArray(part)) {
    for (const item of part) flatten(item, into);
  } else if (isCssStylePart(part)) {
    Object.assign(into, part);
  }
}

function keyframesOf(name: unknown): unknown {
  if (typeof name !== 'string') return name;
  return keyframesNamed(name);
}

// Settings are listed per animation name, so a dropped name takes its slot with it
function pickSlots(value: unknown, slots: readonly number[]): unknown {
  if (!Array.isArray(value)) return value;
  return slots.map(slot => value[slot % value.length]);
}

// The compiler leaves a name as authored when its `@keyframes` sit in another file
// A name nothing declared runs nothing, since Reanimated drops the whole list for one unknown
function withKeyframes(
  style: Record<string, unknown>,
): Record<string, unknown> {
  const { animationName } = style;
  if (animationName === undefined) return style;
  const names = Array.isArray(animationName) ? animationName : [animationName];
  const found = names.map(keyframesOf);
  const slots = found.flatMap((steps, slot) =>
    steps === undefined ? [] : [slot],
  );
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    resolved[key] = key.startsWith('animation')
      ? pickSlots(value, slots)
      : value;
  }
  resolved.animationName = slots.map(slot => found[slot]);
  if (slots.length === 0) delete resolved.animationName;
  return resolved;
}

// The whole style, since a transition runs from one value of a property to the next
function styleOf(node: ISymbioteNode, owned: object): CSSStyle {
  const style: Record<string, unknown> = {};
  flatten(getPublishedStyle(node), style);
  Object.assign(style, owned);
  return withKeyframes(style);
}

function managerFor(node: ISymbioteNode): CSSManager | undefined {
  const shadowNodeWrapper = wrapperOfNode(node);
  const viewTag = getNativeTag(node);
  if (shadowNodeWrapper === undefined || viewTag === undefined) {
    return undefined;
  }
  return new CSSManager({
    shadowNodeWrapper,
    viewTag,
    reactViewName: node.component,
  });
}

function refresh(binding: IBinding): void {
  binding.manager?.update(binding.style, binding.callbacks);
}

function attach(node: ISymbioteNode, binding: IBinding): () => void {
  const manager = managerFor(node);
  binding.manager = manager;
  refresh(binding);
  return () => {
    manager?.unmountCleanup();
    const wrapper = wrapperOfNode(node);
    if (wrapper !== undefined) markNodeAsRemovable(wrapper);
    binding.manager = undefined;
  };
}

// `animation*` and `transition*` go to Reanimated's CSS manager once the node has a Fabric node
// The `onCSS*` callbacks ride along, whichever of the two a node names first
// A node that never names one is not bound, so it pays one lookup
export function claimCssStyle(): () => void {
  const bindings = new WeakMap<ISymbioteNode, IBinding>();
  const callbacks = new WeakMap<ISymbioteNode, Record<string, unknown>>();

  function callbacksOf(node: ISymbioteNode): Record<string, unknown> {
    const standing = callbacks.get(node) ?? {};
    callbacks.set(node, standing);
    return standing;
  }

  const releaseStyle = registerStyleClaim({
    owns: isCSSConfigProp,
    variantsOf: variantsOfPseudoValue,
    receive: (node, owned) => {
      const standing = bindings.get(node);
      if (standing === undefined && Object.keys(owned).length === 0) return;
      const binding = standing ?? {
        style: {},
        callbacks: callbacksOf(node),
        manager: undefined,
      };
      binding.style = styleOf(node, owned);
      if (standing !== undefined) {
        refresh(binding);
        return;
      }
      bindings.set(node, binding);
      bindToNode(node, () => attach(node, binding));
    },
  });

  const releaseCallbacks = registerPropClaim((node, key, value) => {
    if (!isCSSCallbackProp(key)) return false;
    callbacksOf(node)[key] = value;
    const binding = bindings.get(node);
    if (binding !== undefined) refresh(binding);
    return true;
  });

  return () => {
    releaseStyle();
    releaseCallbacks();
  };
}
