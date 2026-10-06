// A headless run has no `DeviceInfo` to answer `Dimensions.get`, so anything that reads the window
// at mount (InputAccessoryView's content width) throws until a test seeds one

import { Dimensions } from '@symbiote-native/engine';

export const TEST_WINDOW = { width: 390, height: 844, scale: 3, fontScale: 1 };

export function seedWindowDimensions(): void {
  Dimensions.set({ window: TEST_WINDOW, screen: TEST_WINDOW });
}
