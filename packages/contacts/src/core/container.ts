import { expoContactsNext, FallbackContainer } from './native-module';

/** @platform ios - Android has no Container concept in expo-contacts. */
export class Container extends (expoContactsNext.Container ??
  FallbackContainer) {}
