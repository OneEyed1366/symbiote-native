// There is no wrapper to make: every host node takes an animated style, so the component is its own
export function createAnimatedComponent<Component>(
  component: Component,
): Component {
  return component;
}

// The CSS-only twin: the engine seam claims a node's CSS, so this is the same identity
export const createCSSAnimatedComponent = createAnimatedComponent;
