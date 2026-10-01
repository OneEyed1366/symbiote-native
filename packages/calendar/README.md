# @symbiote-native/calendar

Add a meeting to the user's calendar, list what is on this week, set a reminder, or hand the user
the system's own event dialog. One API for every [SymbioteNative](../../README.md) adapter (React,
Vue, Svelte, Solid and Angular).

It wraps [`expo-calendar`](https://github.com/expo/expo/tree/main/packages/expo-calendar)
(calendar, event, reminder and attendee CRUD, plus the OS event dialogs) the same way
[`@symbiote-native/print`](../print) wraps its upstream: `expo-modules-core` is a direct
dependency and the upstream JS is hand-ported into `core/`. See the `symbiote-expo-native-module`
project skill for the full mechanism.

**Both of upstream's API surfaces are ported, matching Expo's own layout exactly**: the modern
`SharedObject`-class `ExpoCalendar`/`ExpoCalendarEvent`/`ExpoCalendarReminder`/
`ExpoCalendarAttendee` API (default entry, mirroring upstream's own default `Calendar.ts`) and
the legacy function-based API (`/legacy` subpath, mirroring upstream's `legacy/Calendar.ts`).
Method names, the static-vs-module-level-function split, and per-field platform availability all
match upstream's real source (`src/Calendar.ts` and `src/legacy/Calendar.ts` at sdk-57) directly.

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

- **Android**: `READ_CALENDAR`/`WRITE_CALENDAR` permissions. Both native modules are registered
  and genuinely called by our JS: `ExpoCalendar` (legacy surface, `/legacy` subpath) and
  `CalendarNext` (modern surface, default entry).
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

## Platform availability (modern API)

| Member | iOS | Android |
|---|---|---|
| `ExpoCalendar` CRUD (`createEvent`/`update`/`addEventWithForm`/`delete`), `listEvents` | yes | yes |
| `getDefaultCalendarSync`/`presentPicker`/`getSourcesSync` (module-level) | yes | no |
| `calendar.createReminder`/`listReminders` | yes | no |
| `event.createAttendee` | no | yes |
| `event.getOccurrenceSync`/`getAttendees`/`update`/`delete` | yes | yes |
| `ExpoCalendarReminder` (whole class) | yes | no - no-op class, no properties/methods |
| `ExpoCalendarAttendee` (whole class) | no - no-op class | yes |
| `getCalendarPermissions`/`requestCalendarPermissions` (module-level) | yes | yes |
| `getRemindersPermissions`/`requestRemindersPermissions` (module-level) | yes | no |

An iOS-only or Android-only member throws `UnavailabilityError` on the other platform, or is
absent from the native ambient - check for presence before calling if the call site must run on
both.

## What's not ported

Nothing from `expo-calendar`'s public surface. The legacy `requestPermissionsAsync` is kept as the
deprecated alias upstream ships: it warns and calls `requestCalendarPermissionsAsync`.

## Permission hooks

`useCalendarPermissions`/`useRemindersPermissions` are ported to every adapter (originally
dropped as React-only, since reversed):

- React/Vue/Solid: `createPermissionHook` from `@symbiote-native/{react,vue,solid}`, a tuple
  `[status, request, get]`.
- Svelte: `createPermissionHook` from `@symbiote-native/svelte/runes/create-permission-hook`, a
  boxed getter `{status, requestPermission, getPermission}`.
- Angular: `CalendarPermissionsService`/`RemindersPermissionsService`, `connect(): Signal<...>`.

## Shape

```
src/core/                 modern SharedObject API (default entry)
  enums.ts                 every enum (EntityTypes, Frequency, Availability, ...)
  types.ts                 ICalendarInput/Patch, IEventInput/Patch, IAttendeeInput/Patch, ...
  utils.ts                  stringifyDateValues, getNullableDetailsFields
  native-module.ts          declare class ambients for the 4 SharedObject classes + module fns
  calendar.ts               ExpoCalendar class + module-level functions (getCalendars, ...)
  event.ts                  ExpoCalendarEvent - instance CRUD/attendee methods, static get()
  attendee.ts                ExpoCalendarAttendee (android-only surface)
  reminder.ts                ExpoCalendarReminder (ios-only surface)
src/legacy/                legacy function-based API (/legacy subpath)
  enums.ts                  re-exports src/core/enums.ts - upstream shares one enum source too
  types.ts                  ICalendar, IEvent, IReminder, IAttendee, IRecurrenceRule, ...
  native-module.ts          requireNativeModule('ExpoCalendar')
  calendar.ts                every *Async free function (getCalendarsAsync, createEventAsync, ...)
src/angular/               @symbiote-native/calendar/angular
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto
`src/core/`. `./legacy` aliases onto `src/legacy/`; there is no separate Angular build for it,
matching `@symbiote-native/file-system`'s and `@symbiote-native/media-library`'s dual-surface
precedent.

Every wrapper class extends its native `SharedObject` base directly
(`class ExpoCalendarEvent extends expoCalendarNext.ExpoCalendarEvent`), overriding only the
methods upstream itself overrides (Date stringification, `getNullableDetailsFields`, prototype
upgrade of a returned native instance, or a platform guard) - everything else (like
`openInCalendar`/`editInCalendar`) is inherited from the native ambient untouched, exactly as
upstream leaves it. A module-level `upgradeToX(native)` helper reassigns a returned native
instance's prototype in place (`Object.setPrototypeOf`) rather than calling `new` on the native
class, since Android's Kotlin throws on direct construction of `ExpoCalendar`/`ExpoCalendarEvent`.

## Use it

```ts
// modern surface (default)
import { ExpoCalendar, requestCalendarPermissions } from '@symbiote-native/calendar';

await requestCalendarPermissions();
const calendar = await ExpoCalendar.get(calendarId);
const event = await calendar.createEvent({
  title: 'Standup',
  startDate: new Date(),
  endDate: new Date(Date.now() + 30 * 60_000),
});
await event.update({ notes: 'Daily sync' });
```

```ts
// legacy surface
import { createEventAsync, requestCalendarPermissionsAsync } from '@symbiote-native/calendar/legacy';

await requestCalendarPermissionsAsync();
const eventId = await createEventAsync(calendarId, {
  title: 'Standup',
  startDate: new Date(),
  endDate: new Date(Date.now() + 30 * 60_000),
});
```

## Common questions

- **`getCalendars()` or `createEvent` fails or returns nothing.** Call `requestCalendarPermissions()`
  first and check `granted` (Android: `READ_CALENDAR` and `WRITE_CALENDAR`, added for you).
- **The system event dialog does not appear on iOS, no error.** iOS checks permission before showing
  it: ask first, then call `addEventWithForm`.
- **Default calendar.** `getDefaultCalendarSync()` is iOS only; on Android list calendars and pick.
- **Reminders on Android.** iOS only.
- **Write-only access.** `requestCalendarPermissions(true)` on iOS 17+; swap the Info.plist string by
  hand (see Permissions above).

Sources: [Expo docs: Calendar](https://docs.expo.dev/versions/v56.0.0/sdk/calendar-legacy/),
[expo/expo#36001](https://github.com/expo/expo/issues/36001),
[expo/expo#4991](https://github.com/expo/expo/issues/4991),
[expo/expo#48186](https://github.com/expo/expo/pull/48186).

## Test it

```bash
pnpm vitest run packages/calendar
```
