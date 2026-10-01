# @symbiote-native/contacts

Look up a person, add a contact, edit one in the system form, or let the user grant access to just
the contacts you need (iOS 18). One API for every [SymbioteNative](../../README.md) adapter (React,
Vue, Svelte, Solid and Angular).

It wraps [`expo-contacts`](https://github.com/expo/expo/tree/main/packages/expo-contacts) the same
way [`@symbiote-native/print`](../print) wraps its upstream: `expo-modules-core` is a direct
dependency and the upstream JS is hand-ported into `core/`. See the `symbiote-expo-native-module`
project skill for the full mechanism.

**Both of upstream's API surfaces are ported**, matching its own layout: the modern
`SharedObject`-class `Contact`/`Group`/`Container` API (default entry) and the legacy
function-based API (`/legacy` subpath). Unlike `@symbiote-native/calendar` (which ships only its
modern surface, since upstream's `next` API had no real JS reference to port), `expo-contacts`
ships complete, real JS for both surfaces at sdk-57 - so both are ported here.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --contacts
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --contacts
```

Either way: installs `@symbiote-native/contacts` and wires the native autolinking
automatically, see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/contacts
```

`expo-contacts` and `expo-modules-core` come along as regular, pinned dependencies, never
install either yourself, and never add the `expo` meta-package to this project.

### Required one-time step: native autolinking wiring

Same one-time app wiring every `expo-modules-core` package shares, see
[`@symbiote-native/print`'s README](../print/README.md#required-one-time-step-native-autolinking-wiring)
for the full table; nothing package-specific here.

### Permissions and config plugin

`native-link.json` declares:

- **Android**: `READ_CONTACTS`/`WRITE_CONTACTS` permissions. Two native modules are registered:
  `ExpoContacts` (legacy surface) and `ExpoContactsNext` (modern surface) - both are genuinely
  called by our JS, since both surfaces are ported.
- **iOS**: `NSContactsUsageDescription` (custom wording; reword to fit the app).

</details>

## ContactAccessButton

Every adapter exports `ContactAccessButton` from its own entry (`/react`, `/vue`, `/solid`,
`/svelte`, `/angular`), plus `ContactAccessButton.isAvailable()`. The button is a native view,
iOS 18+ only, and renders nothing on any other platform or version.

Props: `query`, `caption` (`default` / `email` / `phone`), `ignoredEmails`,
`ignoredPhoneNumbers`, `tintColor`, `backgroundColor`, `textColor`, `style`, `testID`,
`nativeID`, `onLayout`, the accessibility and aria props and the responder props.

The view is registered lazily, at the first render: bundlers that inline requires drop a barrel's
load-time side effects. Verifying it on a real iOS 18 device is the app owner's step.

## Notes

- **Request permission first.** Reads and writes fail without it. On iOS 18 a `'limited'`
  `accessPrivileges` means the app sees only the contacts the user shared.
- **`Group` and `Container` are iOS only.** On Android they fall back to a stub that throws
  `Not implemented`.
- **`ContactAccessButton` needs iOS 18.** It renders nothing elsewhere; call
  `ContactAccessButton.isAvailable()` to check.

## What's not ported

Nothing from `expo-contacts`' public surface.

## Platform availability (next API)

| Member | iOS | Android |
|---|---|---|
| `Contact` (all CRUD, static finders, field getters/setters) | yes | yes |
| `Contact.presentAccessPicker` | yes (18+) | no |
| `contact.getMaidenName/setMaidenName/getNickname/setNickname/getBirthday/setBirthday/getNonGregorianBirthday/setNonGregorianBirthday` | yes | no |
| `contact.getSocialProfiles/addSocialProfile/updateSocialProfile/deleteSocialProfile` | yes | no |
| `contact.getImAddresses/addImAddress/updateImAddress/deleteImAddress` | yes | no |
| `contact.getIsFavourite/setIsFavourite` | no | yes |
| `contact.getExtraNames/addExtraName/updateExtraName/deleteExtraName` | no | yes |
| `Group`/`Container` (whole classes) | yes | no - falls back to a stub that throws `Not implemented` |

An unavailable member throws `UnavailabilityError` (function-shaped) or is simply absent
(class-shaped optional method) on the other platform - check for presence before calling if the
call site must run on both.

## Shape

```
src/core/          modern SharedObject API (default entry)
  enums.ts          ContactField, ContactsSortOrder, NonGregorianCalendar
  types.ts          all record/patch/query types
  native-module.ts  declare class ambients for Contact/Group/Container + module functions
  contact.ts        export class Contact extends expoContactsNext.Contact {}
  group.ts          export class Group extends (expoContactsNext.Group ?? FallbackGroup) {}
  container.ts      export class Container extends (expoContactsNext.Container ?? FallbackContainer) {}
  permissions.ts     get/requestPermissionsAsync
  listeners.ts       add/removeAllContactsChangeListeners
src/legacy/         legacy function-based API (/legacy subpath)
  enums.ts           Fields, CalendarFormats, ContainerTypes, SortTypes, ContactTypes
  types.ts           legacy record/query types
  native-module.ts   requireNativeModule('ExpoContacts')
  contacts.ts        get/add/update/removeContactAsync, groups, containers, permissions
src/angular/        @symbiote-native/contacts/angular
```

`./react`, `./vue`, `./svelte`, and `./solid` are `exports`-map aliases straight onto
`src/core/`. `./legacy` aliases onto `src/legacy/`; there is no separate Angular build for it,
matching `@symbiote-native/file-system`'s and `@symbiote-native/media-library`'s dual-surface
precedent.

`Contact`/`Group`/`Container` extend their native `SharedObject` base directly with no added
sugar - every method already exists on the native class, so the wrapper's only job is being a
named, `instanceof`-checkable subclass. iOS registers the next class as `ContactNext` (distinct
from the deprecated legacy `Contact` JS class); Android registers it directly as `Contact`.
`native-module.ts` aliases `.ContactNext` onto `.Contact` at import time on iOS so both
platforms expose the same `expoContactsNext.Contact`.

## Use it

```ts
import { Contact, requestPermissionsAsync } from '@symbiote-native/contacts';

await requestPermissionsAsync();
const contact = await Contact.create({ givenName: 'Jane', familyName: 'Doe' });
await contact.addEmail({ label: 'work', address: 'jane@example.com' });
```

```ts
// legacy surface
import { getContactsAsync, requestPermissionsAsync } from '@symbiote-native/contacts/legacy';

await requestPermissionsAsync();
const { data } = await getContactsAsync({ name: 'Jane' });
```

## Common questions

- **`getAll` returns too few contacts.** Check the permission; on iOS 18 `'limited'` means the user
  shared only some. Use `ContactAccessButton` or `Contact.presentAccessPicker()`.
- **Slow with many contacts.** Page with `limit` / `offset` and use `Contact.getAllDetails(fields)`
  for only the fields you show.
- **No phone or email in a list row.** Fetch `getPhones()` / `getEmails()` per contact when needed.
- **Writes fail on Android.** Request `WRITE_CONTACTS` via `requestPermissionsAsync()` first.
- **Own picker?** Prefer `Contact.presentPicker()` or `ContactAccessButton`.

Sources: [Expo docs: Contacts](https://docs.expo.dev/versions/latest/sdk/contacts/),
[expo/expo#386](https://github.com/expo/expo/issues/386),
[expo/expo#200](https://github.com/expo/expo/issues/200),
[expo/expo#29224](https://github.com/expo/expo/issues/29224).

## Test it

```bash
pnpm vitest run packages/contacts
```
