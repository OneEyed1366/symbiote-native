import {
  bindToNode,
  getNativeTag,
  registerBeforeFlush,
  registerPostCommit,
  registerPropClaim,
  unregisterPostCommit,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { maybeBuild } from 'react-native-reanimated/src/animationBuilder';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import { updateLayoutAnimations } from 'react-native-reanimated/src/UpdateLayoutAnimations';
import { isConfig, type IConfig } from './layout-config';
import { layoutConfigIdOf } from './native-id';
import { createStyleOverwriteCheck } from './style-overwrite';
import {
  createLayoutScopes,
  isScope,
  type IPendingEntering,
} from './layout-scopes';

const ENTERING = 'entering';
const EXITING = 'exiting';
// The prop of the marker node `LayoutAnimationConfig` renders
const SCOPE = 'layoutAnimationScope';

// Keyed by the tag, which a node only has once it has committed
const TAG_KEYED = {
  layout: LayoutAnimationType.LAYOUT,
  exiting: LayoutAnimationType.EXITING,
} as const satisfies Record<string, LayoutAnimationType>;

type ITagKeyedProp = keyof typeof TAG_KEYED;

function isTagKeyed(key: string): key is ITagKeyedProp {
  return key in TAG_KEYED;
}

function configureEntering(node: ISymbioteNode, config: IConfig): number {
  const id = layoutConfigIdOf(node);
  updateLayoutAnimations(id, LayoutAnimationType.ENTERING, maybeBuild(config));
  return id;
}

type IHeld = { config: unknown; unbind: () => void };

function configureByTag(
  node: ISymbioteNode,
  key: ITagKeyedProp,
  config: IConfig | undefined,
): () => void {
  return bindToNode(node, () => {
    const tag = getNativeTag(node);
    if (tag === undefined) return undefined;
    updateLayoutAnimations(tag, TAG_KEYED[key], config && maybeBuild(config));
    return undefined;
  });
}

// An entering animation a scope skipped is taken back, and with it the id the node carried
function cancelEntering({ node, id }: IPendingEntering): void {
  updateLayoutAnimations(id, LayoutAnimationType.ENTERING, undefined);
  routeProp(node, 'nativeID', undefined);
}

type IHeldByNode = WeakMap<ISymbioteNode, Map<string, IHeld>>;

// Kept apart from the claim so each reads on its own: this one follows the prop, the node by node
function followTagKeyed(
  held: IHeldByNode,
  node: ISymbioteNode,
  key: ITagKeyedProp,
  value: unknown,
): void {
  const standing = held.get(node)?.get(key);
  if (standing?.config === value) return;
  standing?.unbind();
  const next = held.get(node) ?? new Map<string, IHeld>();
  const config = isConfig(value) ? value : undefined;
  next.set(key, { config: value, unbind: configureByTag(node, key, config) });
  held.set(node, next);
}

// `entering` is read once, as upstream does; `layout` and `exiting` follow the prop. Returns the
// release of the claim
export function claimLayoutAnimationProps(): () => void {
  const entered = new WeakSet<ISymbioteNode>();
  const held: IHeldByNode = new WeakMap();
  const scopes = createLayoutScopes(cancelEntering);
  const overwrite = createStyleOverwriteCheck();

  const releaseClaim = registerPropClaim((node, key, value) => {
    if (isConfig(value) && (key === ENTERING || key === EXITING)) {
      overwrite.note(node, value);
    }
    if (key === SCOPE) {
      if (isScope(value)) scopes.noteScope(node, value);
      return true;
    }
    if (key === ENTERING) {
      if (isConfig(value) && !entered.has(node)) {
        entered.add(node);
        scopes.noteEntering(node, configureEntering(node, value));
      }
      return true;
    }
    if (!isTagKeyed(key)) return false;
    followTagKeyed(held, node, key, value);
    return true;
  });
  const releaseFlush = registerBeforeFlush(scopes.flush);
  const releaseOverwrite = registerBeforeFlush(overwrite.flush);
  registerPostCommit(scopes.afterCommit);
  return () => {
    releaseClaim();
    releaseFlush();
    releaseOverwrite();
    unregisterPostCommit(scopes.afterCommit);
  };
}
