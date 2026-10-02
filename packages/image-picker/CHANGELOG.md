# @symbiote-native/image-picker

## 0.1.1

### Patch Changes

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Port the hooks that upstream ships for React only to Vue, Solid, Svelte and Angular: the `useAuthRequest` family, calendar and reminders permissions, `useImageManipulator`, camera and media-library permissions, screen-capture permissions and `usePreventScreenCapture`, `useIncomingShare`, and `usePowerState`. The logic lives once in each package's core, each adapter only holds its own state.

- [#91](https://github.com/OneEyed1366/symbiote-native/pull/91) [`ad8c99a`](https://github.com/OneEyed1366/symbiote-native/commit/ad8c99aeb15001c513391eeed3c7270fc0ee7578) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Rewrite the README of every Expo wrapper package around the problem it solves, and add a Common questions section with cited sources.
