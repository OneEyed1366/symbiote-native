// Framework-agnostic helpers for createAnimatedComponent. Both the React and Vue
// adapters wrap a base component so it accepts AnimatedNodes in its props; the wrap
// mechanism (capture the host node, build an AnimatedProps leaf, reduce animated
// props to their current values, override with the passthrough style) is pure JS,
// identical across frameworks. Only `assignRef` is framework-ref-specific and stays
// per-adapter; everything here is shared so a new adapter reuses it verbatim.

import { AnimatedNode } from './graph';
import { animatedNodeOrObject } from './object';
import { AnimatedStyle } from './style';

export function isAnimatedNode(value: unknown): value is AnimatedNode {
  return value instanceof AnimatedNode;
}

// RN's `passthroughAnimatedPropExplicitValues` carries explicit (already-rasterized) prop
// values (e.g. a sticky header's debounced `{style:{transform:[{translateY}]}}`) that must
// override the animated prop in the COMMITTED props so the Fabric ShadowTree (hit-testing)
// stays current while the native driver animates. Read its `style` without a cast.
export function readPassthroughStyle(passthrough: unknown): unknown {
  if (typeof passthrough !== 'object' || passthrough === null) return undefined;
  return Reflect.get(passthrough, 'style');
}

// Заменяет animated-значения в props текущим числом, чтобы первый кадр нёс конкретные props
// `collapsable: false` как у RN, т.к. у сплющенной вью нет тега для нативного драйвера
export function reduceProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    const value = props[key];
    const node = reducibleNode(key, value);
    out[key] = node === undefined ? value : node.__getValue();
  }
  out.collapsable = false;
  return out;
}

// Дети управляются реконсилером и в props для свёртки не участвуют
const CHILDREN_PROP = 'children';

// Узел, который сворачивается в текущее значение: `style`, сам узел или вложенный объект
function reducibleNode(key: string, value: unknown): AnimatedNode | undefined {
  if (key === CHILDREN_PROP) return undefined;
  if (key === 'style') return AnimatedStyle.from(value);
  return animatedNodeOrObject(value);
}

// A ScrollView / FlatList / SectionList ref captures an imperative handle (RN's
// getScrollableNode pattern), NOT the raw host node, so a native event or animated
// props have nothing to bind to. Unwrap it via getScrollNode() to the underlying
// SymbioteNode; View / Text / Image already hand back the node directly, so they fall
// through unchanged.
export function resolveHostNode(instance: unknown): unknown {
  if (instance !== null && typeof instance === 'object') {
    const getScrollNode = Reflect.get(instance, 'getScrollNode');
    if (typeof getScrollNode === 'function')
      return getScrollNode.call(instance);
  }
  return instance;
}
