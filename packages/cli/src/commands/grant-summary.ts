import * as clack from '@clack/prompts';
import type { IDiscoveredBundle } from '../grant-bundles.js';

// One clack.note() box per granted bundle — the library's own primitive for a callout that must
// stand out from the surrounding output, same shape as Homebrew's post-install "Caveats" section
// or Expo's per-permission config-plugin log. Shared between `grant`, `add`, and `new` so all
// three report a grant the same way.
export function printGrantedNotes(granted: readonly IDiscoveredBundle[]): void {
  for (const entry of granted) {
    clack.note(
      `${entry.bundle.warning}\n\nNext: ${entry.bundle.nextSteps}`,
      entry.bundle.label,
    );
  }
}
