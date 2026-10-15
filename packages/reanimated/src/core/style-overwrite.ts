import { getExplicitStyle, type ISymbioteNode } from '@symbiote-native/engine';
import { checkStyleOverwriting } from 'react-native-reanimated/src/animationBuilder';
import type { StyleProps } from 'react-native-reanimated/src/commonTypes';
import type { NestedArray } from 'react-native-reanimated/src/createAnimatedComponent/commonTypes';
import type { IConfig } from './layout-config';

const DISPLAY_NAME = 'an animated view';

// A function or a missing style has nothing to share a property with
function isStyleInput(value: unknown): value is NestedArray<StyleProps> {
  return typeof value === 'object' && value !== null;
}

// Upstream's development warning for `entering` and `exiting` that set what the style sets too
// A node is told once, after its render has put both props on it
export function createStyleOverwriteCheck() {
  const pending = new Map<ISymbioteNode, IConfig>();
  const warned = new WeakSet<ISymbioteNode>();

  return {
    note(node: ISymbioteNode, config: IConfig): void {
      if (__DEV__ && !warned.has(node)) pending.set(node, config);
    },
    flush(): void {
      for (const [node, config] of pending) {
        const style = getExplicitStyle(node);
        if (!isStyleInput(style)) continue;
        checkStyleOverwriting(config, style, DISPLAY_NAME, () =>
          warned.add(node),
        );
      }
      pending.clear();
    },
  };
}
