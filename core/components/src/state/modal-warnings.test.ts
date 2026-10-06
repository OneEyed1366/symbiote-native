// RN's Modal.js `confirmProps` (dev only): three props combinations the platform cannot honour
import { describe, expect, it } from 'vitest';
import { modalWarningsOf } from './modal-warnings';

const NOT_SUPPORTED_PRESENTATION =
  "Modal with 'pageSheet' presentation style and 'transparent' value is not supported.";
const NOT_SUPPORTED_NAVIGATION_BAR =
  'Modal with translucent navigation bar and without translucent status bar is not supported.';
const NEEDS_ON_REQUEST_CLOSE =
  'Modal requires the onRequestClose prop when used with `allowSwipeDismissal`. This is necessary to prevent state corruption.';

describe('modalWarningsOf', () => {
  it('warns about a transparent modal with a presentation style other than overFullScreen', () => {
    expect(
      modalWarningsOf(
        { presentationStyle: 'pageSheet', transparent: true },
        'ios',
      ),
    ).toEqual([NOT_SUPPORTED_PRESENTATION]);
  });

  it('stays quiet for overFullScreen, or when the modal is not transparent', () => {
    expect(
      modalWarningsOf(
        { presentationStyle: 'overFullScreen', transparent: true },
        'ios',
      ),
    ).toEqual([]);
    expect(modalWarningsOf({ presentationStyle: 'pageSheet' }, 'ios')).toEqual(
      [],
    );
  });

  it('warns about a translucent navigation bar without a translucent status bar', () => {
    expect(
      modalWarningsOf({ navigationBarTranslucent: true }, 'android'),
    ).toEqual([NOT_SUPPORTED_NAVIGATION_BAR]);
    expect(
      modalWarningsOf(
        { navigationBarTranslucent: true, statusBarTranslucent: true },
        'android',
      ),
    ).toEqual([]);
  });

  it('asks for onRequestClose with allowSwipeDismissal, on iOS only', () => {
    expect(modalWarningsOf({ allowSwipeDismissal: true }, 'ios')).toEqual([
      NEEDS_ON_REQUEST_CLOSE,
    ]);
    expect(modalWarningsOf({ allowSwipeDismissal: true }, 'android')).toEqual(
      [],
    );
    expect(
      modalWarningsOf(
        { allowSwipeDismissal: true, onRequestClose: () => {} },
        'ios',
      ),
    ).toEqual([]);
  });

  it('reports every warning that applies, in RN order', () => {
    expect(
      modalWarningsOf(
        {
          presentationStyle: 'formSheet',
          transparent: true,
          navigationBarTranslucent: true,
          allowSwipeDismissal: true,
        },
        'ios',
      ),
    ).toEqual([
      "Modal with 'formSheet' presentation style and 'transparent' value is not supported.",
      NOT_SUPPORTED_NAVIGATION_BAR,
      NEEDS_ON_REQUEST_CLOSE,
    ]);
  });
});
