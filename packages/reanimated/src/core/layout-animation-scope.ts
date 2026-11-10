// `skipEntering` and `skipExiting` as upstream has them: the children neither animate in nor out
export type ILayoutAnimationScope = {
  skipEntering?: boolean;
  skipExiting?: boolean;
};

// A node of its own that takes no part in layout, so the engine can ask it about its children
const SCOPE_STYLE = { display: 'contents' };

// The props of the marker node `LayoutAnimationConfig` renders, the same in every adapter
export function layoutAnimationScopeProps({
  skipEntering,
  skipExiting,
}: ILayoutAnimationScope) {
  return {
    style: SCOPE_STYLE,
    layoutAnimationScope: { skipEntering, skipExiting },
  };
}
