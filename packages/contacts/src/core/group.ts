import { expoContactsNext, FallbackGroup } from './native-module';

/** @platform ios - Android has no Group concept in expo-contacts. */
export class Group extends (expoContactsNext.Group ?? FallbackGroup) {}
