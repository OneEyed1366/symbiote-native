import type { INativeNavigationBarModule } from './shared';

// Android-only native module - upstream's own non-android entry types an empty stub, so every
// function guards a missing method with UnavailabilityError rather than calling this
export const expoNavigationBar: Partial<INativeNavigationBarModule> = {};
