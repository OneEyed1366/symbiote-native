import { UnavailabilityError } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import {
  expoContactsNext,
  ON_CONTACTS_CHANGE_EVENT_NAME,
} from './native-module';

export function addContactsChangeListener(
  listener: () => void,
): EventSubscription {
  if (!expoContactsNext.addListener) {
    throw new UnavailabilityError('Contacts', 'addContactsChangeListener');
  }
  return expoContactsNext.addListener(ON_CONTACTS_CHANGE_EVENT_NAME, listener);
}

export function removeAllContactsChangeListeners(): void {
  expoContactsNext.removeAllListeners?.(ON_CONTACTS_CHANGE_EVENT_NAME);
}
