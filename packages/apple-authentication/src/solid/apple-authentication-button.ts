import { defineOptionalDescriptorComponent } from '@symbiote-native/solid';
import { renderAppleAuthenticationButton } from '../core/apple-authentication-button';
import type { IAppleAuthenticationButtonProps } from '../core/apple-authentication-button';

/** Solid twin of `expo-apple-authentication`'s `AppleAuthenticationButton`, iOS only */
export const AppleAuthenticationButton =
  defineOptionalDescriptorComponent<IAppleAuthenticationButtonProps>(
    renderAppleAuthenticationButton,
  );
