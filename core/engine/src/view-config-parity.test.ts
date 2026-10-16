// RN's `BaseViewConfig` declares the events every view can emit, this pins what ours lacks
// A new RN base event changes the list below and fails the test, which is the cue to review it

import { describe, expect, it } from 'vitest';
import { isEventFor } from './view-config';

const BASE_VIEW_CONFIG_IOS =
  'react-native/Libraries/NativeComponent/BaseViewConfig.ios';

type IEventTypes = Record<
  string,
  { phasedRegistrationNames?: { bubbled: string }; registrationName?: string }
>;

// `onPress` -> `press`, the name the engine routes by
function listenerNameOf(registrationName: string): string {
  const bare = registrationName.slice('on'.length);
  return bare.charAt(0).toLowerCase() + bare.slice(1);
}

function listenerNamesOf(types: IEventTypes): string[] {
  return Object.values(types).map(type =>
    listenerNameOf(
      type.phasedRegistrationNames?.bubbled ?? type.registrationName ?? 'on',
    ),
  );
}

// Text input events stay inert on a plain view, no native producer emits them there
// The touch events are routed by `node-events`, not by `isEventFor`
const KNOWN_ABSENT = [
  'change',
  'submitEditing',
  'endEditing',
  'keyPress',
  'touchStart',
  'touchMove',
  'touchCancel',
  'touchEnd',
  'pointerCancel',
  'pointerDown',
  'pointerMove',
  'pointerUp',
  'pointerEnter',
  'pointerLeave',
  'pointerOver',
  'pointerOut',
  'gotPointerCapture',
  'lostPointerCapture',
  'gestureHandlerEvent',
  'gestureHandlerStateChange',
];

describe('base view events against RN BaseViewConfig', () => {
  it('knows every RN base event except the ones pinned as absent', async () => {
    const { default: baseConfig } = await import(
      /* @vite-ignore */ BASE_VIEW_CONFIG_IOS
    );
    const declared = [
      ...listenerNamesOf(baseConfig.bubblingEventTypes),
      ...listenerNamesOf(baseConfig.directEventTypes),
    ];
    const absent = declared.filter(name => !isEventFor('RCTView', name));

    expect(absent).toEqual(KNOWN_ABSENT);
  });

  // QUESTION: pointer and gesture-handler events never reach a plain view, is that wanted
  it('[characterization — behavior not confirmed] pointer events are not events here', () => {
    expect(isEventFor('RCTView', 'pointerDown')).toBe(false);
  });
});
