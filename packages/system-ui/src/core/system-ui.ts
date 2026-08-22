// Hand-ported from .vendors/expo/packages/expo-system-ui/src/SystemUI.ts (sdk-57), verbatim
// apart from resolving the native module through native-module.ts (this repo's convention,
// matching local-auth/device/cellular) instead of a bare `import ExpoSystemUI from
// './ExpoSystemUI'`.
import type { ColorValue } from 'react-native';
import { Platform, processColor } from 'react-native';

import { expoSystemUI } from './native-module';

/**
 * Changes the root view background color. Call this outside of your component tree, e.g. in
 * the root file, since it affects the whole app.
 * @example
 * ```ts
 * setBackgroundColorAsync("black");
 * ```
 * @param color Any valid [CSS 3 (SVG) color](http://www.w3.org/TR/css3-color/#svg-color), or
 * `null` to clear the override.
 */
export async function setBackgroundColorAsync(
  color: ColorValue | null,
): Promise<void> {
  if (color == null) {
    return await expoSystemUI.setBackgroundColorAsync(null);
  } else {
    const colorNumber = Platform.OS === 'web' ? color : processColor(color);
    return await expoSystemUI.setBackgroundColorAsync(colorNumber);
  }
}

/**
 * Gets the root view background color.
 * @example
 * ```ts
 * const color = await getBackgroundColorAsync();
 * ```
 * @returns Current root view background color in hex format. `null` if the background color is
 * not set.
 */
export async function getBackgroundColorAsync(): Promise<ColorValue | null> {
  return await expoSystemUI.getBackgroundColorAsync();
}
