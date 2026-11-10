// Plays the Android touch sound, a copy of RN's `SoundManager` over `NativeSoundManager`
// TODO(rn-port): not a member of the `react-native` index, so no host entry exists
// A static deep import would pull RN's `TurboModuleRegistry` into every adapter's main barrel

// Called from the press machine in `core/components`, on Android, right before `onPress`
// Gated by `android_disableSound !== true`, as in `Pressability.js`

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';

const SOUND_MODULE = 'SoundManager';

type INativeSoundManager = {
  playTouchSound(): void;
};

// Lazily resolved so importing this module has no native side effect.
let soundModule: INativeSoundManager | null | undefined;

function getModule(): INativeSoundManager | null {
  if (soundModule === undefined) {
    soundModule = getNativeModule<INativeSoundManager>(SOUND_MODULE);
    dlog(
      `SoundManager: SoundManager module ${soundModule ? 'resolved' : 'NOT resolved (null)'}`,
    );
  }
  return soundModule;
}

export const SoundManager = {
  // Degrades to a no-op (logged) when the module is absent — never throws — matching every other
  // optional native module in this layer.
  playTouchSound(): void {
    const module = getModule();
    if (module === null) {
      dlog(
        'SoundManager.playTouchSound -> SoundManager native module unavailable, no-op',
      );
      return;
    }
    dlog('SoundManager.playTouchSound');
    module.playTouchSound();
  },
};
