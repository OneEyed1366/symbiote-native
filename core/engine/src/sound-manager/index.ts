// SoundManager: plays the Android system touch-sound feedback. Mirrors RN's
// Libraries/Components/Sound/SoundManager.js — a single method, `playTouchSound`, wrapping the
// TurboModule the same way (`NativeSoundManager` resolves via `TurboModuleRegistry.get`, not
// `getEnforcing`, so a missing module degrades to a no-op there too).
//
// The native contract, from `src/private/specs_DEPRECATED/modules/NativeSoundManager.js`:
//   playTouchSound(): void
//
// Called from `core/components/src/state/pressable.ts`'s press machine, on Android, right before
// `onPress` fires, gated by `android_disableSound !== true` — Pressability.js:754-756. Not a Fabric
// prop: no ViewConfig declares `android_disableSound`, it only ever gates this JS-side call.

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';

const SOUND_MODULE = 'SoundManager';

interface INativeSoundManager {
  playTouchSound(): void;
}

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
