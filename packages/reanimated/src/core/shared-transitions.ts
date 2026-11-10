import {
  bindToNode,
  getNativeTag,
  registerBeforeFlush,
  registerPropClaim,
  whenCommitted,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { maybeBuild } from 'react-native-reanimated/src/animationBuilder';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import { getStaticFeatureFlag } from 'react-native-reanimated/src/featureFlags';
import { SharedTransition } from 'react-native-reanimated/src/layoutReanimation/SharedTransition';
import { updateLayoutAnimations } from 'react-native-reanimated/src/UpdateLayoutAnimations';
import { isConfig, type IConfig } from './layout-config';
import { layoutConfigIdOf } from './native-id';

const TAG = 'sharedTransitionTag';
const STYLE = 'sharedTransitionStyle';

type IState = {
  tag: string | undefined;
  style: IConfig | undefined;
  // What native was last given, so a prop passed again with every render configures nothing
  transition: IConfig | undefined;
  unbind: (() => void) | undefined;
};

function isCommitted(node: ISymbioteNode): boolean {
  let isDone = false;
  whenCommitted(node, () => {
    isDone = true;
  })();
  return isDone;
}

// Once a node has a tag the config goes under it, as upstream does after the first render
function bindSharedTransition(
  node: ISymbioteNode,
  state: IState,
  transition: IConfig | undefined,
): void {
  const sharedTag = state.tag;
  state.unbind?.();
  state.unbind = bindToNode(node, () => {
    const tag = getNativeTag(node);
    if (tag === undefined) return undefined;
    updateLayoutAnimations(
      tag,
      LayoutAnimationType.SHARED_ELEMENT_TRANSITION,
      transition && maybeBuild(transition),
      undefined,
      transition && sharedTag,
    );
    return undefined;
  });
}

function reconcile(node: ISymbioteNode, state: IState): void {
  if (!getStaticFeatureFlag('ENABLE_SHARED_ELEMENT_TRANSITIONS')) return;
  if (state.tag === undefined) {
    if (state.transition === undefined) return;
    state.transition = undefined;
    bindSharedTransition(node, state, undefined);
    return;
  }
  const transition = state.style ?? state.transition ?? new SharedTransition();
  if (state.transition === transition) return;
  state.transition = transition;
  if (isCommitted(node)) {
    bindSharedTransition(node, state, transition);
    return;
  }
  updateLayoutAnimations(
    layoutConfigIdOf(node),
    LayoutAnimationType.SHARED_ELEMENT_TRANSITION_NATIVE_ID,
    maybeBuild(transition),
    undefined,
    state.tag,
  );
}

// Both props come with one render, so the node is settled once, right before the flush
export function claimSharedTransitionProps(): () => void {
  const states = new WeakMap<ISymbioteNode, IState>();
  const dirty = new Set<ISymbioteNode>();

  const releaseClaim = registerPropClaim((node, key, value) => {
    if (key !== TAG && key !== STYLE) return false;
    const state = states.get(node) ?? {
      tag: undefined,
      style: undefined,
      transition: undefined,
      unbind: undefined,
    };
    if (key === TAG) state.tag = typeof value === 'string' ? value : undefined;
    else state.style = isConfig(value) ? value : undefined;
    states.set(node, state);
    dirty.add(node);
    return true;
  });
  const releaseFlush = registerBeforeFlush(() => {
    const nodes = [...dirty];
    dirty.clear();
    for (const node of nodes) {
      const state = states.get(node);
      if (state !== undefined) reconcile(node, state);
    }
  });
  return () => {
    releaseClaim();
    releaseFlush();
  };
}
