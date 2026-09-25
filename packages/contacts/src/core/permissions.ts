import { expoContactsNext } from './native-module';
import type { ContactsPermissionResponse } from './types';

export async function getPermissionsAsync(): Promise<ContactsPermissionResponse> {
  return expoContactsNext.getPermissionsAsync();
}

export async function requestPermissionsAsync(): Promise<ContactsPermissionResponse> {
  return expoContactsNext.requestPermissionsAsync();
}
