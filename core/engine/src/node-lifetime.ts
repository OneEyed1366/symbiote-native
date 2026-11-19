// What a node that genuinely left the tree gives up, passed to the detach sweep as one callback

import { detachAnimatedProps } from './animated/host-binding';
import type { ISymbioteNode } from './node-types';
import { releaseMediaNode } from './style-registry/media-subscriptions';

export function detachNodeState(node: ISymbioteNode): void {
  detachAnimatedProps(node);
  releaseMediaNode(node);
}
