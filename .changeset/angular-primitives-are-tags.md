---
'@symbiote-native/angular': major
---

`InputAccessoryView`, `Pressable`, `SafeAreaView`, `Switch`, `TextInput`, `TouchableHighlight`,
`TouchableOpacity`, `RefreshControl`, `ScrollView` and `ScrollViewStickyHeader` are no longer
exported as directive components from `@symbiote-native/angular` — an app's `imports: [...]` array
can no longer name them.

Each is now the intrinsic tag Angular's own AOT lowering pass (`babel-register-composed.cjs`,
`ngtsc` → `@angular/compiler-cli/linker/babel`) compiles directly, the same tag every other
adapter writes. `Switch` and `TextInput`'s controlled two-way binding moves to two new exports,
`SwitchValueAccessor` and `TextInputValueAccessor` — an app using `[(ngModel)]` or `formControl*`
on either tag now imports the accessor instead of the deleted component; both ride the shared
`SYMBIOTE_ELEMENTS` provider. `IStickyHeaderComponentType` goes with `ScrollViewStickyHeader` — a
sticky header is composed by the engine now, not supplied as a component type.

Migration: `imports: [Pressable]` + `<Pressable (press)="...">` becomes `<pressable (press)="...">`
with no import; `[(ngModel)]="value"` on a `<switch>`/`<text-input>` needs
`imports: [SwitchValueAccessor]` / `imports: [TextInputValueAccessor]` in its place.
