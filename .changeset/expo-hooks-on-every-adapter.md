---
'@symbiote-native/auth-session': patch
'@symbiote-native/calendar': patch
'@symbiote-native/image-manipulator': patch
'@symbiote-native/image-picker': patch
'@symbiote-native/screen-capture': patch
'@symbiote-native/sharing': patch
'@symbiote-native/battery': patch
---

Port the hooks that upstream ships for React only to Vue, Solid, Svelte and Angular: the `useAuthRequest` family, calendar and reminders permissions, `useImageManipulator`, camera and media-library permissions, screen-capture permissions and `usePreventScreenCapture`, `useIncomingShare`, and `usePowerState`. The logic lives once in each package's core, each adapter only holds its own state.
