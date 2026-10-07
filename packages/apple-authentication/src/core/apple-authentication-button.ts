// Ядро `AppleAuthenticationButton`: нативный view системной кнопки Sign in with Apple, только iOS
import { Platform, requireNativeViewManager } from 'expo-modules-core';
import { el } from '@symbiote-native/components';
import type {
  IAccessibilityProps,
  IAriaProps,
  IDescriptor,
  IResponderProps,
} from '@symbiote-native/components';
import { defineExpoNativeView, isDevBuild } from '@symbiote-native/engine';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import { APPLE_AUTHENTICATION_MODULE_NAME } from './constants';
import type {
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from './types';

const PRESS_EVENT_PROP = 'onButtonPress';

// Фон и скругление задают `buttonStyle` и `cornerRadius`, а не `style`, это правило App Store
export type IAppleAuthenticationButtonProps = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    /** Call `signInAsync` in here */
    onPress: () => void;
    buttonType: AppleAuthenticationButtonType;
    buttonStyle: AppleAuthenticationButtonStyle;
    /** Works like `style.borderRadius` of a View */
    cornerRadius?: number;
    /** Needs a width and a height, or the button does not appear */
    style?: IStyleProp<Omit<IViewStyle, 'backgroundColor' | 'borderRadius'>>;
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
  };

// Регистрация идёт при рендере: побочный эффект барреля теряется в release
const buttonView = defineExpoNativeView(
  requireNativeViewManager,
  APPLE_AUTHENTICATION_MODULE_NAME,
);

export const appleAuthenticationButtonViewName = buttonView.name;

export function ensureAppleAuthenticationButtonRegistered(): boolean {
  if (!Platform.select({ ios: true, default: false })) return false;
  return buttonView.ensureRegistered();
}

/** `null` means the caller renders nothing, the system button exists only on iOS */
export function renderAppleAuthenticationButton(
  props: object,
): IDescriptor | null {
  if (!ensureAppleAuthenticationButtonRegistered()) {
    if (isDevBuild()) {
      console.warn("'AppleAuthenticationButton' is not available.");
    }
    return null;
  }
  const { onPress, ...viewProps } = Object.fromEntries(Object.entries(props));
  return el(appleAuthenticationButtonViewName(), {
    ...viewProps,
    [PRESS_EVENT_PROP]: onPress,
  });
}
