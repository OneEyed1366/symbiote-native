import type { INativeIntentLauncherModule } from './shared';

// Android-only native module - upstream's own non-android entry is `export default {} as any`,
// so every function guards a missing method with UnavailabilityError rather than calling this
export const expoIntentLauncher: Partial<INativeIntentLauncherModule> = {};
