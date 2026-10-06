// Turning a header, footer or empty slot value into a VNode

import { h, isVNode, type Component, type VNode } from '@vue/runtime-core';

function isComponent(value: unknown): value is Component {
  return (
    typeof value === 'function' || (typeof value === 'object' && value !== null)
  );
}

// A list component element is either a Vue component (invoked via `h`) or a ready VNode, narrowed
// with `isVNode` first because a VNode is an object too
export function resolveElement(value: unknown): VNode | undefined {
  if (value === undefined || value === null) return undefined;
  if (isVNode(value)) return value;
  if (isComponent(value)) return h(value);
  return undefined;
}
