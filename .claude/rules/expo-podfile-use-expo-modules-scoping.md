# `def use_expo_modules!` in an expo-* Podfile must be `class ::Object`, not a bare top-level `def`

All six `examples/expo-*/ios/Podfile`s hand-roll `use_expo_modules!` (they redirect Expo's Ruby
autolinking to `expo-modules-autolinking` directly, since the project deliberately avoids relying
on `expo/scripts/autolinking.rb` — see `<examples_vs_dot_examples>` in root CLAUDE.md). Every one
of them defined it as a bare top-level `def use_expo_modules!(options = {}); ...; end`.

That bare `def` breaks `Expo.podspec`'s `if defined?(use_expo_modules!) — s.dependency
'ExpoModulesCore'` guard, silently: CocoaPods loads a Podfile via `instance_eval` on the Podfile
object, so a bare top-level `def` inside it becomes a **singleton method of that one Podfile
instance** — visible when the `target do...end` block calls it, invisible everywhere else.
`Expo.podspec` checks `defined?(use_expo_modules!)` in its OWN separate `eval(string, nil, path)`
(self = the `Pod` module), which never sees that singleton method. The guard silently evaluates
false, `Expo.podspec` never adds `ExpoModulesCore`/`ExpoModulesJSI` as CocoaPods dependencies, and
the `Expo` pod's header search path never gets `${PODS_ROOT}/Headers/Public/ExpoModulesCore}`.

Symptom, found 2026-08-21 on `expo-solid`: `pod install` succeeds looking completely normal
("103 dependencies... 102 pods installed"), and the FIRST sign of trouble is deep into
`xcodebuild`, as a wall of hundreds of wrapped-command-line "error" lines from every third-party
Fabric component (`rnscreens`, `RNBootSplash`, `ReactCodegen`...) — all just `clang` invocations
echoed verbatim by the CLI, not real diagnostics. The one real error is buried at the very end:

```
error 'ExpoModulesCore/Platform.h' file not found
error could not build Objective-C module 'Expo'
```

Confirm with `Podfile.lock` before touching anything — grep the `Expo (…):` dependency block; if
`ExpoModulesCore`/`ExpoModulesJSI` are missing from it, this is the bug, not a stale-Pods issue
(the CocoaPods-staleness gotchas already documented in `example-shared-package-staleness.md` are a
different failure mode and don't apply here — `rm -rf Pods && pod install` reproduces this
identically because the Podfile itself is wrong, not the cache).

## Fix

Wrap the method in `class ::Object` (leading `::`, matching the file's existing `module ::Expo`
reopening one section above it — that `::` prefix matters too, for the same instance_eval-nesting
reason). This makes it a real global instance method, exactly like a `require`d file's top-level
`def` would (that's why the two `require File.join(autolinking_root, 'scripts/ios/...')` calls
right above never had this problem — `require` always evaluates at genuine Ruby top level):

```ruby
class ::Object
  def use_expo_modules!(options = {})
    return if @current_target_definition.autolinking_manager.present?

    @current_target_definition.autolinking_manager =
      ::Expo::AutolinkingManager.new(self, @current_target_definition, options).use_expo_modules!
    maybe_generate_xcode_env_file!()
    generate_or_remove_xcode_env_updates_file!()
  end
end
```

A first attempt without the `::` prefix (`class Object`) looked plausible but broke the OTHER
call site instead — `pod install` failed immediately with `undefined method 'use_expo_modules!'
for an instance of Pod::Podfile` when the `target do...end` block tried to call it. The `::`
prefix is not decorative; omit it and the class reopening lands somewhere other than true
top-level `::Object`, matching why `module ::Expo` above already used it. Verify the fix by
grepping `Podfile.lock` for `ExpoModulesCore`/`ExpoModulesJSI` under the `Expo (…):` block, and
the target's `Expo.debug.xcconfig` for `"${PODS_ROOT}/Headers/Public/ExpoModulesCore"`, before
spending a full `xcodebuild` run to confirm.

Fixed in all six examples 2026-08-21: `expo-solid`, `expo-angular`, `expo-react`, `expo-svelte`,
`expo-vue-sfc`, `expo-vue-tsx`. If a future `create-symbiote`-style scaffolder or a Podfile
regeneration reintroduces the bare `def`, this is the fix — not a Pods reinstall, not an Xcode
DerivedData clear.
