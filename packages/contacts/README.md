# @symbiote-native/contacts

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-contacts`](https://github.com/expo/expo/tree/main/packages/expo-contacts) - reading,
creating, and editing the device address book - usable from **every** adapter, React, Vue,
Svelte, Solid, and Angular, not just React. Built the same way as
[`@symbiote-native/print`](../print): an `expo-modules-core`-based wrapper (see the
`symbiote-expo-native-module` project skill for the full mechanism).

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

## What's not ported

- **`ContactAccessButton`** - a real native VIEW component (`requireNativeView`, iOS-only,
  a `React.PureComponent`). Per `<third_party_rn_packages_are_react_only>`, a native-view-backed
  React component is out of scope for a module-only (`symbiote-expo-native-module`) wrapper; it
  would need the `symbiote-third-party-native-view` recipe as a separate follow-up. Its own
  native module (`ExpoContactAccessButton`) is not referenced anywhere in this package.

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

## Test it

```bash
pnpm vitest run packages/contacts
```
