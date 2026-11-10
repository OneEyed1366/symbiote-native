import { mergeLayerFragment } from './merge-layer-fragment.js';
import { applyReanimatedBabelPlugin } from './apply-reanimated-babel-plugin.js';

// The three dependencies, then the worklets plugin last in the app's babel config
// False means the config has no plugins list to put it in, and the developer has to
export function applyReanimatedLayer(root: string): boolean {
  mergeLayerFragment(root, 'reanimated');
  return applyReanimatedBabelPlugin(root);
}
