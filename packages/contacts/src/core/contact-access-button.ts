import {
  Platform,
  requireNativeViewManager,
  requireOptionalNativeModule,
} from 'expo-modules-core';
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
  IColorValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';

export const CONTACT_ACCESS_BUTTON_MODULE_NAME = 'ExpoContactAccessButton';

export type IContactAccessButtonCaption = 'default' | 'email' | 'phone';

// Every field is iOS 18+ only, the button renders nothing anywhere else
export type IContactAccessButtonProps = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    /** Matched against contacts not yet exposed to the app, typically from a search field */
    query?: string;
    /** Caption under the contact name when the query has one match, nothing by default */
    caption?: IContactAccessButtonCaption;
    /** Contacts matching `query` that also match one of these emails are left out */
    ignoredEmails?: string[];
    /** Contacts matching `query` that also match one of these phone numbers are left out */
    ignoredPhoneNumbers?: string[];
    /** Tint of the button and of the modal shown when there is more than one match */
    tintColor?: IColorValue;
    /** Button background, keep it opaque to satisfy the platform legibility rules */
    backgroundColor?: IColorValue;
    /** Button title color, a dimmed version of it is used for the caption */
    textColor?: IColorValue;
    style?: IStyleProp<IViewStyle>;
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
  };

type IContactAccessButtonModule = { isAvailable: boolean };

export function contactAccessButtonViewName(): string {
  return expoViewManagerName(CONTACT_ACCESS_BUTTON_MODULE_NAME);
}

/** True only on iOS 18.0 and newer, where the native module reports the button as available */
export function isContactAccessButtonAvailable(): boolean {
  return (
    Platform.OS === 'ios' &&
    (requireOptionalNativeModule<IContactAccessButtonModule>(
      CONTACT_ACCESS_BUTTON_MODULE_NAME,
    )?.isAvailable ??
      false)
  );
}

// Registers the view config in React Native's registry, which the engine derives the view's events
// and prop processors from. Called at render, not at import: a registration that only a barrel's
// load-time side effect performs is dropped by Metro's `inlineRequires` in release
export function ensureContactAccessButtonRegistered(): boolean {
  if (Platform.OS !== 'ios') return false;
  return tryRegisterNativeView(() =>
    requireNativeViewManager(CONTACT_ACCESS_BUTTON_MODULE_NAME),
  );
}

// `object`, not the props type: Vue and Angular hand over an untyped attribute bag
export function renderContactAccessButton(props: object): IDescriptor | null {
  if (!ensureContactAccessButtonRegistered()) return null;
  return el(contactAccessButtonViewName(), { ...props });
}
