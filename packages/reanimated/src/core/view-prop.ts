import type { ISymbioteNode } from '@symbiote-native/engine';
import { getViewProp as getUpstreamViewProp } from 'react-native-reanimated/src/core';
import { wrapperOfNode } from './shadow-node-wrapper';

// Upstream finds the wrapper through the React renderer; this hands it a component that already
// carries the wrapper where its lookup reads it, `__internalInstanceHandle.stateNode.node`
export function getViewProp<Value>(
  viewTag: number,
  propName: string,
  node: ISymbioteNode | null | undefined,
): Promise<Value> {
  const wrapper = node ? wrapperOfNode(node) : undefined;
  if (wrapper === undefined) {
    throw new Error(
      '[Reanimated] Function `getViewProp` requires a component to be passed as an argument on Fabric.',
    );
  }
  return getUpstreamViewProp<Value>(viewTag, propName, {
    __internalInstanceHandle: { stateNode: { node: wrapper } },
  });
}
