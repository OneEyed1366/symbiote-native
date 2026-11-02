// Which header applies each system inset down a stack hierarchy, as react-native-screens decides it
// The top inset is taken once by the outermost visible header, the other edges per header

import { featureFlags } from './screens-config';

export type IEdgeInsetState = {
  // An ancestor header already applied the top inset, so the subtree skips it
  topAlreadyApplied: boolean;
  // An ancestor header opted out of the edge, and the opt-out holds for the whole subtree
  leftDisabled: boolean;
  rightDisabled: boolean;
  bottomDisabled: boolean;
};

export type IEdgeInsetInput = {
  headerVisible: boolean;
  disableTopInsetApplication?: boolean;
  disableLeftInsetApplication?: boolean;
  disableRightInsetApplication?: boolean;
  disableBottomInsetApplication?: boolean;
};

export type IEdgeInsetApplication = {
  consumeTopInset: boolean;
  consumeLeftInset: boolean;
  consumeRightInset: boolean;
  consumeBottomInset: boolean;
  legacyTopInsetBehavior: boolean;
  // What the screens below this header read as their enclosing state
  next: IEdgeInsetState;
};

export const EMPTY_EDGE_INSETS: IEdgeInsetState = {
  topAlreadyApplied: false,
  leftDisabled: false,
  rightDisabled: false,
  bottomDisabled: false,
};

// Any scope shape works, as long as it links its enclosing scope through `parent`
export type IEdgeInsetScope = {
  edgeInsets?: IEdgeInsetState;
  parent?: IEdgeInsetScope;
};

// A Tab or Drawer scope in between carries no state, so the search goes on up the chain
export function findAncestorEdgeInsets(
  scope: IEdgeInsetScope | undefined,
): IEdgeInsetState {
  for (let current = scope; current !== undefined; current = current.parent) {
    if (current.edgeInsets !== undefined) return current.edgeInsets;
  }
  return EMPTY_EDGE_INSETS;
}

export function resolveEdgeInsetApplication(
  enclosing: IEdgeInsetState,
  input: IEdgeInsetInput,
): IEdgeInsetApplication {
  const legacyTopInsetBehavior =
    featureFlags.experiment.androidLegacyTopInsetBehavior;
  const wantsTopInset =
    legacyTopInsetBehavior ||
    (!enclosing.topAlreadyApplied && input.headerVisible);
  const leftDisabled =
    enclosing.leftDisabled || input.disableLeftInsetApplication === true;
  const rightDisabled =
    enclosing.rightDisabled || input.disableRightInsetApplication === true;
  const bottomDisabled =
    enclosing.bottomDisabled || input.disableBottomInsetApplication === true;
  return {
    consumeTopInset: wantsTopInset && input.disableTopInsetApplication !== true,
    consumeLeftInset: !leftDisabled,
    consumeRightInset: !rightDisabled,
    consumeBottomInset: !bottomDisabled,
    legacyTopInsetBehavior,
    next: {
      topAlreadyApplied: enclosing.topAlreadyApplied || wantsTopInset,
      leftDisabled,
      rightDisabled,
      bottomDisabled,
    },
  };
}
