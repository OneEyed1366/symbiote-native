import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDiscoveredBundle } from '../grant-bundles.js';

vi.mock('@clack/prompts', () => ({
  note: vi.fn(),
}));

const clack = await import('@clack/prompts');
const { printGrantedNotes } = await import('./grant-summary.js');

const AUDIO_BUNDLE: IDiscoveredBundle = {
  packageName: '@symbiote-native/audio',
  bundle: {
    id: 'recording',
    label: 'Background audio recording',
    warning: 'w',
    nextSteps: 'n',
  },
};
const LOCATION_BUNDLE: IDiscoveredBundle = {
  packageName: '@symbiote-native/location',
  bundle: {
    id: 'background',
    label: 'Background location tracking',
    warning: 'w2',
    nextSteps: 'n2',
  },
};

describe('printGrantedNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // why: a policy-sensitive grant deserves its own visually separate callout (clack.note's whole
  // purpose — same shape as Homebrew's post-install "Caveats" section), titled by the bundle's own
  // label so a reader with several boxes on screen can tell them apart at a glance.
  it('opens a note box titled with the bundle label', () => {
    printGrantedNotes([AUDIO_BUNDLE]);

    expect(clack.note).toHaveBeenCalledWith(
      expect.any(String),
      'Background audio recording',
    );
  });

  it('includes the warning and a labeled next-steps line in the note body', () => {
    printGrantedNotes([AUDIO_BUNDLE]);

    const [message] = vi.mocked(clack.note).mock.calls[0];
    expect(message).toContain('w');
    expect(message).toContain('Next: n');
  });

  it('opens one note box per granted bundle', () => {
    printGrantedNotes([AUDIO_BUNDLE, LOCATION_BUNDLE]);

    expect(clack.note).toHaveBeenCalledTimes(2);
    expect(clack.note).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      'Background audio recording',
    );
    expect(clack.note).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      'Background location tracking',
    );
  });

  it('opens nothing for an empty list', () => {
    printGrantedNotes([]);

    expect(clack.note).not.toHaveBeenCalled();
  });
});
