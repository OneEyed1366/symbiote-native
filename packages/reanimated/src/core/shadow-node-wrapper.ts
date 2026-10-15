import {
  getShadowNodeWrapper,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import type { ShadowNodeWrapper } from 'react-native-reanimated/src/commonTypes';

// The engine hands the host object over untouched, so all there is to check is that one arrived
function isShadowNodeWrapper(
  value: object | undefined,
): value is ShadowNodeWrapper {
  return value !== undefined;
}

// What the UI side needs to find the Fabric node; none before the node has committed
export function wrapperOfNode(
  node: ISymbioteNode,
): ShadowNodeWrapper | undefined {
  const found = getShadowNodeWrapper(node);
  return isShadowNodeWrapper(found) ? found : undefined;
}
