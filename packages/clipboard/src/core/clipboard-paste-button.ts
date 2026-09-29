import { Platform, requireNativeViewManager } from 'expo-modules-core';
import { el } from '@symbiote-native/components';
import type {
  IAccessibilityProps,
  IAriaProps,
  IDescriptor,
  IResponderProps,
} from '@symbiote-native/components';
import {
  expoViewManagerName,
  tryRegisterNativeView,
} from '@symbiote-native/engine';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type {
  IAcceptedContentType,
  IClipboardImage,
  ICornerStyle,
  IDisplayMode,
  IGetImageOptions,
  IPasteEventPayload,
} from './types';

export const CLIPBOARD_PASTE_BUTTON_MODULE_NAME = 'ExpoClipboard';

const PASTE_EVENT_PROP = 'onPastePressed';

const PASTE_TYPE = { text: 'text', image: 'image' } as const;

// Apple restricts the control: its colors, corners and label come from the props below, not `style`
export type IClipboardPasteButtonProps = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    /** Called with the pasted text or image, inspect `type` to tell them apart */
    onPress: (data: IPasteEventPayload) => void;
    /** Leaving it out lets the color follow the system theme */
    backgroundColor?: string | null;
    /** @default 'white' */
    foregroundColor?: string | null;
    /** @default 'capsule' */
    cornerStyle?: ICornerStyle | null;
    /** @default 'iconAndLabel' */
    displayMode?: IDisplayMode | null;
    /** Needs a width and a height, or the button does not appear */
    style?: IStyleProp<
      Omit<IViewStyle, 'backgroundColor' | 'borderRadius' | 'color'>
    >;
    imageOptions?: IGetImageOptions | null;
    /** Do not combine `plain-text` with `html`, all text would be treated as `html` */
    acceptedContentTypes?: IAcceptedContentType[];
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
  };

export function clipboardPasteButtonViewName(): string {
  return expoViewManagerName(CLIPBOARD_PASTE_BUTTON_MODULE_NAME);
}

// Registers the view config in React Native's registry, which the engine derives the view's events
// and prop processors from. Called at render, not at import: a registration that only a barrel's
// load-time side effect performs is dropped by Metro's `inlineRequires` in release
export function ensureClipboardPasteButtonRegistered(): boolean {
  if (!Platform.select({ ios: true, default: false })) return false;
  return tryRegisterNativeView(() =>
    requireNativeViewManager(CLIPBOARD_PASTE_BUTTON_MODULE_NAME),
  );
}

function isImageSize(value: unknown): value is IClipboardImage['size'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'width') === 'number' &&
    typeof Reflect.get(value, 'height') === 'number'
  );
}

/** Reads the native paste event, `null` when its payload has neither a text nor an image shape */
export function toPasteEventPayload(
  event: ISymbioteEvent,
): IPasteEventPayload | null {
  const { type, text, data, size } = event.nativeEvent;
  if (type === PASTE_TYPE.text && typeof text === 'string')
    return { type, text };
  if (
    type === PASTE_TYPE.image &&
    typeof data === 'string' &&
    isImageSize(size)
  ) {
    return { type, data, size };
  }
  return null;
}

// `object`, not the props type: Vue and Angular hand over an untyped attribute bag
export function renderClipboardPasteButton(props: object): IDescriptor | null {
  if (!ensureClipboardPasteButtonRegistered()) return null;
  const onPress: unknown = Reflect.get(props, 'onPress');
  const viewProps = Object.fromEntries(
    Object.entries(props).filter(([key]) => key !== 'onPress'),
  );
  return el(clipboardPasteButtonViewName(), {
    ...viewProps,
    [PASTE_EVENT_PROP]: (event: ISymbioteEvent): void => {
      const payload = toPasteEventPayload(event);
      if (payload && typeof onPress === 'function') onPress(payload);
    },
  });
}
