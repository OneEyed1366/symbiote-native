import { requireNativeModule } from 'expo-modules-core';
import type { AndroidHaptics, ImpactFeedbackStyle, NotificationFeedbackType } from './types';

const EXPO_HAPTICS_MODULE_NAME = 'ExpoHaptics';

// Every method is optional — each call site checks for its presence before calling through and
// throws an UnavailabilityError itself, matching upstream's own per-platform capability checks
// rather than assuming the native module implements the whole surface (same convention as
// packages/local-auth/src/core/native-module.ts). `performHapticsAsync` in particular only
// exists on the Android native module (HapticsModule.kt) — iOS's HapticsModule.swift has no
// equivalent, since `performAndroidHapticsAsync` short-circuits on non-Android platforms before
// ever reaching this call.
export type INativeHapticsModule = {
  notificationAsync?(type: NotificationFeedbackType): Promise<void>;
  impactAsync?(style: ImpactFeedbackStyle): Promise<void>;
  selectionAsync?(): Promise<void>;
  performHapticsAsync?(type: AndroidHaptics): Promise<void>;
};

export const expoHaptics = requireNativeModule<INativeHapticsModule>(EXPO_HAPTICS_MODULE_NAME);
