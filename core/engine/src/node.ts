// The mutation API, as a barrel so `from './node'` keeps naming the whole of it. Adapters call it
// and every call appends an OPCODE to `mutation-buffer.ts`, т.к. the tree is the HOST's

export {
  ANCHOR_COMPONENT,
  RAW_TEXT_COMPONENT,
  SURFACE_COMPONENT,
  TEXT_COMPONENT,
  VIRTUAL_TEXT_COMPONENT,
  VOID_COMPONENT,
  isAnchor,
  isSymbioteEvent,
  isSymbioteNode,
  type IClassStyleParts,
  type IEventDispatch,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from './node-types';

export {
  createAnchor,
  createElement,
  createRawText,
  createSurfaceRoot,
  createVoid,
  debugNodeId,
  setNodeComponent,
} from './node-instance';

export {
  functionPropOf,
  functionPropsOf,
  markPropsDirty,
  setProp,
  setText,
  takePropKeyTally,
  takePropStats,
  writeProp,
} from './node-props';

export {
  clearPublishedStyle,
  getExplicitStyle,
  getPublishedStyle,
  isSameShallowStyle,
  setNodeHidden,
  setNodePressed,
  setNodeUnderlayShown,
} from './node-style';

export {
  hasListenerFor,
  listenerFor,
  setBehaviorListener,
  setEventListener,
  setNodeDispatch,
} from './node-events';

export { routeProp } from './node-route';

export {
  appendChild,
  censusRetainedTree,
  insertBefore,
  removeChild,
} from './node-tree';

export type { ITreeCensus } from './tree-host';
