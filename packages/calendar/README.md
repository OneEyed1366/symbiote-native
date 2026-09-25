# @symbiote-native/calendar

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-calendar`'s `next` API](https://github.com/expo/expo/tree/main/packages/expo-calendar) -
the modern, `SharedObject`-class-based `ExpoCalendar`/`ExpoCalendarEvent`/
`ExpoCalendarAttendee`/`ExpoCalendarReminder` surface, full cross-platform (iOS + Android) parity -
usable from **every** adapter, React, Vue, Svelte, Solid, and Angular, not just React. Built the
same way as [`@symbiote-native/print`](../print): an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism).

**The legacy function-based API (`Calendar.ts`) is deliberately not ported.** Upstream's own
default entry point exports it, but this package wraps only the `next` class-based surface - a
product decision, not a technical limitation.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --calendar
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --calendar
```

Either way: installs `@symbiote-native/calendar` and wires the native autolinking
automatically, see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/calendar
```

`expo-calendar` and `expo-modules-core` come along as regular, pinned dependencies, never
install either yourself, and never add the `expo` meta-package to this project.

### Required one-time step: native autolinking wiring

Same one-time app wiring every `expo-modules-core` package shares, see
[`@symbiote-native/print`'s README](../print/README.md#required-one-time-step-native-autolinking-wiring)
for the full table; nothing package-specific here.

### Permissions and config plugin

`native-link.json` declares:

- **Android**: `READ_CALENDAR`/`WRITE_CALENDAR` permissions. The native module we call is
  `CalendarNext`; the legacy `ExpoCalendar` module is still listed (marked `internal: true`)
  purely so autolinking stays consistent with the real npm package's
  `expo-module.config.json` - our JS never calls it.
- **iOS**: `NSCalendarsUsageDescription`, `NSRemindersUsageDescription`,
  `NSRemindersFullAccessUsageDescription`, `NSCalendarsFullAccessUsageDescription` (custom
  wording; reword to fit the app).

**Not modeled** (upstream's config plugin's `writeOnlyAccess` opt-in, which swaps
`NSCalendarsFullAccessUsageDescription` for `NSCalendarsWriteOnlyAccessUsageDescription`): this
manifest format has no iOS equivalent of Android's `optionalManifestBundles` for a plist-key swap.
If write-only calendar access (iOS 17+) is needed, add
`NSCalendarsWriteOnlyAccessUsageDescription` to the app's own Info.plist by hand and drop
`NSCalendarsFullAccessUsageDescription`.

</details>

## Platform availability

| Member | iOS | Android |
|---|---|---|
| `ExpoCalendar.getAllAsync/getByIdAsync/createAsync` | yes | yes |
| `ExpoCalendar.getDefaultSync` | yes | no |
| `ExpoCalendar.presentPickerAsync` | yes | no |
| `ExpoCalendar.getSourcesSync` | yes | no |
| `calendar.listEventsAsync/createEventAsync/addEventWithFormAsync/updateAsync/deleteAsync` | yes | yes |
| `calendar.listRemindersAsync/createReminderAsync` | yes | no |
| `event.createAttendeeAsync` | no | yes |
| `event.openInCalendarAsync/editInCalendarAsync/getOccurrence/getAttendeesAsync/updateAsync/deleteAsync` | yes | yes |
| `ExpoCalendarReminder` (whole class) | yes | no - no-op class, no properties/methods |
| `ExpoCalendarAttendee` (whole class) | no - no-op class | yes |
| `getCalendarPermissionsAsync/requestCalendarPermissionsAsync` | yes | yes |
| `getRemindersPermissionsAsync/requestRemindersPermissionsAsync` | yes | no |

An iOS-only or Android-only method throws `UnavailabilityError` on the other platform - check
`calendar.listReminders`/`expoCalendarNext.presentPicker` (etc.) for presence before calling if
the call site needs to run on both.

## What's not ported

- **The legacy function-based API** (`getCalendarsAsync`/`createEventAsync`/... as free
  functions) - excluded by product decision, see the top of this README. Do not re-add it here;
  if it's ever wanted, it belongs in its own `/legacy` subpath, matching
  `@symbiote-native/media-library`'s and `@symbiote-native/file-system`'s dual-surface precedent.
- **`useCalendarPermissions`/`useRemindersPermissions`** - real React hooks
  (`createPermissionHook`), same §11 class as image-picker's dropped hooks. Call
  `getCalendarPermissionsAsync`/`requestCalendarPermissionsAsync` (and the reminders pair)
  directly instead.

## Shape

```
src/core/enums.ts         every enum (EntityTypes, Frequency, Availability, ...)
src/core/types.ts         ICalendarInput/Patch, IEventInput/Patch, IAttendeeInput/Patch, ...
src/core/utils.ts         stringifyDateValues, splitNullableFields (patch -> {record, nullableFields})
src/core/native-module.ts declare class ambients for the 4 SharedObject classes + module functions
src/core/calendar.ts      ExpoCalendar - static factories + instance CRUD/list methods
src/core/event.ts         ExpoCalendarEvent - static finders + instance CRUD/attendee methods
src/core/attendee.ts      ExpoCalendarAttendee (android-only surface)
src/core/reminder.ts      ExpoCalendarReminder (ios-only surface)
src/core/permissions.ts   get/requestCalendarPermissionsAsync, reminders pair (ios only)
src/angular/              @symbiote-native/calendar/angular
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto `src/core/`.

Every wrapper class extends its native `SharedObject` base directly
(`class ExpoCalendarEvent extends expoCalendarNext.ExpoCalendarEvent`). Native factory
methods/functions return plain native instances; a module-level `upgradeToX(native)` helper
reassigns the prototype to the wrapper class in place (`Object.setPrototypeOf`) rather than
calling `new` on the native class, since Android's Kotlin throws on direct construction of
`ExpoCalendar`/`ExpoCalendarEvent`.

## Use it

```ts
import { ExpoCalendar, requestCalendarPermissionsAsync } from '@symbiote-native/calendar';

await requestCalendarPermissionsAsync();
const calendar = await ExpoCalendar.createAsync({ title: 'Work', color: '#4285F4' });
const event = await calendar.createEventAsync({
  title: 'Standup',
  startDate: new Date(),
  endDate: new Date(Date.now() + 30 * 60_000),
});
await event.updateAsync({ notes: 'Daily sync' });
```

## Test it

```bash
pnpm vitest run packages/calendar
```
