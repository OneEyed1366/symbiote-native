// AccessibilityInfo (iOS) moved to @symbiote-native/engine. This thin re-export keeps @symbiote-native/react's
// surface identical; Metro selects the engine's accessibility-info.ios.ts on an iOS host.
export { AccessibilityInfo } from '@symbiote-native/engine';
export type {
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
} from '@symbiote-native/engine';
