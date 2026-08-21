import { Platform, UnavailabilityError } from 'expo-modules-core';

import { expoSms, type INativeSmsOptions } from './native-module';
import type { ISmsAttachment, ISmsOptions, ISmsResponse } from './types';

const NATIVE_MODULE_NAME = 'expo-sms';

// Android's SMSModule puts a single `Intent.EXTRA_STREAM` on the composer intent and reads
// `attachments[0]` to fill it, so anything past the first would silently never arrive.
const ANDROID_ATTACHMENT_LIMIT = 1;

/**
 * Whether this device can send an SMS at all. `false` on the iOS simulator, which has no
 * Messages app, and on any Android device without telephony hardware.
 */
export async function isAvailableAsync(): Promise<boolean> {
  return expoSms.isAvailableAsync?.() ?? false;
}

/**
 * Opens the system SMS composer with the recipients and message text filled in. Nothing is sent
 * on the user's behalf — they still press send themselves, and may edit or discard the draft.
 *
 * Resolves once the composer closes:
 * - `{ result: 'sent' }` — the user sent or scheduled the message.
 * - `{ result: 'cancelled' }` — the user dismissed the composer.
 * - `{ result: 'unknown' }` — always, on Android, which cannot report the outcome.
 *
 * The only thing observed is whether a message left the composer; neither its final text nor
 * its final recipients are read back.
 */
export async function sendSMSAsync(
  addresses: string | string[],
  message: string,
  options?: ISmsOptions,
): Promise<ISmsResponse> {
  if (!expoSms.sendSMSAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'sendSMSAsync');
  }

  const recipients = Array.isArray(addresses) ? addresses : [addresses];
  for (const recipient of recipients) {
    // Guards a caller without type checking: the native side decodes a list of strings, and a
    // number or a null in there fails as an opaque conversion error far from its cause.
    if (typeof recipient !== 'string') {
      throw new TypeError(
        'Invalid address passed to sendSMSAsync. Every recipient must be a string.',
      );
    }
  }

  const nativeOptions: INativeSmsOptions = {};
  if (options?.attachments) {
    nativeOptions.attachments = normalizeAttachments(options.attachments);
  }

  return expoSms.sendSMSAsync(recipients, message, nativeOptions);
}

function normalizeAttachments(
  attachments: ISmsAttachment | ISmsAttachment[],
): ISmsAttachment[] {
  const list = Array.isArray(attachments) ? attachments : [attachments];
  return Platform.OS === 'android'
    ? list.slice(0, ANDROID_ATTACHMENT_LIMIT)
    : list;
}
