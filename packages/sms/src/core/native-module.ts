import { requireNativeModule } from 'expo-modules-core';
import type { ISmsAttachment, ISmsResponse } from './types';

const EXPO_SMS_MODULE_NAME = 'ExpoSMS';

/**
 * The options record the native side decodes — narrower than the public `ISmsOptions`, which
 * also accepts a lone attachment object. Both `SMSOptions.kt` and `SMSOptions.swift` declare
 * `attachments` as a list, so the single-object form is normalised away before it gets here.
 */
export type INativeSmsOptions = {
  attachments?: ISmsAttachment[];
};

// Both members are optional: each call site checks for its own before calling through, the same
// per-platform capability check upstream makes, rather than assuming the native module
// implements the whole surface.
export type INativeSmsModule = {
  isAvailableAsync?(): Promise<boolean>;
  sendSMSAsync?(
    addresses: string[],
    message: string,
    options: INativeSmsOptions,
  ): Promise<ISmsResponse>;
};

export const expoSms =
  requireNativeModule<INativeSmsModule>(EXPO_SMS_MODULE_NAME);
