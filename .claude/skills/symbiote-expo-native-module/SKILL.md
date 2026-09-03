---
name: symbiote-expo-native-module
description: "Symbiote third-party Expo native-MODULE wrapper workflow — read BEFORE wrapping a package built on expo-modules-core (expo-sensors, expo-camera, any Expo Module, not a plain RN NativeModule or codegenNativeComponent view), or before adding expo-modules-core here for the first time. Distinct from symbiote-third-party-native-view (native VIEW, ViewConfig+Descriptor) — this is a native MODULE, zero view, pure EventEmitter/async-function surface. Reference case: sensors package wrapping expo-sensors sdk-57, pilot Accelerometer. Covers: depend on expo-modules-core only, never expo meta-package (own CLI/Metro-config/babel-preset, collides with this repos Metro pipeline); native code NOT vendored (autolinking resolves pnpm symlinks itself); JS ported into our core since upstream hard-imports from expo; autolinking is a one-time app-level native change; permissions ship with the native code; testing mocks the native module, no Fabric harness. Trigger: wrap an expo package, expo-modules-core or autolinking questions."
---

# Symbiote — wrapping a third-party Expo native MODULE (no view, no Descriptor)

A third-party package built on **expo-modules-core** (Expo's own native-module runtime —
Swift/Kotlin "Modules" registered through Expo's own autolinking, not RN's NativeModule/
TurboModule system) is architecturally different from anything else this repo has wrapped.
`expo-sensors`, and packages like it, ship **no native view at all** — every export is a
plain JS class over an EventEmitter (`addListener`, `hasListeners`, `removeAllListeners`) plus
a handful of async functions (`isAvailableAsync`, `getPermissionsAsync`,
`requestPermissionsAsync`, `setUpdateInterval`). There is no `codegenNativeComponent`, no
ViewConfig, no `Descriptor`, no per-adapter descriptor bridge. This skill is the twin of
`symbiote-third-party-native-view` for that shape — read that skill first if the package
you're wrapping has a visible native view; read this one if it doesn't.

Reference case, decided 2026-07 while planning `@symbiote-native/sensors` (wraps
`expo-sensors` sdk-57, pilot component = `Accelerometer` only — the other 7 sensor families
follow later by the same recipe). All facts below were verified by reading the actual
vendored source, not from memory or upstream docs alone: `.vendors/expo` is a shared git
checkout (via the `.vendors` symlink used across other projects too) — read a specific SDK's
files with `git -C .vendors/expo show origin/sdk-57:<path>` after `git -C .vendors/expo fetch
origin sdk-57`; do **not** `git checkout`/switch its branch, that mutates a checkout other
projects also read.

## 1. Dependency scope — `expo-modules-core` directly, never the `expo` meta-package

Expo's own bare-workflow docs say "install `expo` first." Do not. `packages/expo/package.json`
lists 15+ forced `dependencies`, not just a native-module runtime:

```json
"@expo/cli", "@expo/config", "@expo/config-plugins", "@expo/metro", "@expo/metro-config",
"babel-preset-expo", "expo-asset", "expo-constants", "expo-file-system", "expo-font",
"expo-keep-awake", "expo-modules-autolinking", "expo-modules-core", "@ungap/structured-clone", ...
```

`@expo/metro-config` + `babel-preset-expo` is a second, competing Metro/babel pipeline —
this repo already has its own (Vue SFC transformer, Angular AOT linker, the CSS-parser
transform; see the `symbiote-sfc-style-compiler` skill and the root CLAUDE.md Build &
platform section). Installing `expo` risks someone later "helpfully" wiring in
`babel-preset-expo`/`expo/metro-config` per Expo's own docs and silently breaking that
pipeline.

The fix: depend on **`expo-modules-core` only**. It already exports everything a sensor-style
wrapper needs — confirmed by reading `packages/expo-modules-core/src/index.ts` at `sdk-57`:

```ts
export * from './PermissionsInterface';   // PermissionResponse, PermissionExpiration, PermissionStatus
export * from './PermissionsHook';
```

Those are the *only* two things `expo-sensors`' own JS imports from the `expo` package
(`DeviceSensor.ts`: `import { type PermissionResponse, PermissionStatus } from 'expo'`) — so
nothing upstream is actually lost by skipping `expo`.

Version check, not an assumption to carry forward blindly: `packages/expo/
bundledNativeModules.json` at `sdk-57` pins `"react-native": "0.86.0"` — this repo's exact
pinned RN version. That match was a genuine (and load-bearing) surprise for sdk-57; re-verify
it against the target SDK version for every future Expo package, don't assume it holds.

## 2. Do NOT vendor/copy native code — this is a different autolinking mechanism

`symbiote-third-party-native-view` mandates physically copying the wrapped library's native
source into a package-local `.rn-<lib>` folder, because CocoaPods' `source_files` resolution
walks the filesystem with `Dir.glob` and **never crosses a symlink** — and pnpm always hides
the real package behind a `.pnpm` store symlink. That workaround does **not** apply here.

`expo-modules-autolinking` resolves packages through its own JS/Ruby layer, and its
`src/utils.ts` (verified at `sdk-57`) does this before ever handing a path to CocoaPods or
Gradle:

```ts
export const maybeRealpath = async (target: string): Promise<string | null> => {
  try { return await fs.promises.realpath(target); }
  catch { return null; }
};
```

`fs.promises.realpath` resolves the pnpm symlink to the package's real physical directory —
so the podspec/Gradle config `expo-modules-autolinking` generates already points at the real
files, not through a symlink `Dir.glob` would fail to traverse. Confirmed further by reading
the actual `ios/ExpoSensors.podspec`: it declares only `s.dependency 'ExpoModulesCore'` and
`s.source_files = "**/*.{h,m,swift}"` relative to its own directory — nothing about the
wrapper needs to restate or copy that.

**Consequence:** install the real upstream package (e.g. `expo-sensors`) as an ordinary
`dependency` of the wrapper, purely so its native `ios/`/`android/` folders physically exist
in `node_modules` for `use_expo_modules!`/the Android autolinking script to find. Never touch,
copy, or fork those native files. If you catch yourself reaching for the
`.rn-<lib>`-vendoring recipe from the native-view skill while wrapping an
expo-modules-core-based package, stop — that recipe solves a bug this mechanism doesn't have.

Accepted side effect: the upstream package's `peerDependencies` typically list
`{ "expo": "*", "react-native": "*" }` with no `peerDependenciesMeta` marking `expo` optional
— pnpm prints an "unmet peer dependency" warning for `expo` at install time. Cosmetic only
(we never import `expo`'s JS); can be silenced later via root `package.json`
`pnpm.peerDependencyRules` if it becomes noisy enough to matter.

## 3. JS is ported into our own `core`, never imported from upstream

The real upstream JS (e.g. `expo-sensors`' `build/DeviceSensor.js`) does a hard
`import ... from 'expo'` — if `expo` isn't installed (and per §1 it never is here), that
import breaks Metro bundling the moment anything reaches it. So the wrapped package is a
**dependency for its native folder only** — its JS entry point (`main`/`module` in its
`package.json`) is never imported from our code.

Instead, hand-port the class hierarchy into `packages/<lib>/src/core/`, same spirit as
`packages/splash-screen` porting `react-native-bootsplash`'s pure JS into `core/hide.ts` (see
the `components_split_logic_view_lifecycle` invariant in the root CLAUDE.md) — but here the
reason is a concrete hard-import break, not just architectural preference:

- Port the base class (`DeviceSensor`) and each sensor class (`Accelerometer`, …) verbatim,
  changing only the one import line to pull `PermissionResponse`/`PermissionStatus` from
  `expo-modules-core` instead of `expo`.
- Resolve the native module the same way upstream's own one-liner does — e.g.
  `packages/expo-sensors/src/ExponentAccelerometer.ts` is just
  `export default requireNativeModule('ExponentAccelerometer')` from `expo-modules-core`.
  Copy that one line per sensor, not the whole upstream JS tree.

## 4. Autolinking is still required — one-time, app-level, smaller than the `expo` package implies

Skipping the `expo` meta-package does not skip native linking. `use_expo_modules!` (the
Podfile macro) lives in `expo-modules-autolinking`'s own Ruby scripts
(`scripts/ios/autolinking_manager.rb`), **not** in the `expo` package — confirmed by reading
it directly. It scans `node_modules` for `expo-module.config.json`/native-Expo-module
packages via its own JS resolver, independent of whether `expo` itself is present.

Required, once per native host app (not per wrapped package):

| File | Change |
|---|---|
| `ios/Podfile` | add `use_expo_modules!` |
| `android/build.gradle` / `settings.gradle` | apply the `expo-modules-autolinking` Gradle script |
| `ios/*/AppDelegate.swift` | minimal Expo bootstrap hook |
| `android/.../MainApplication.kt` | minimal Expo bootstrap hook |

```
§4a_gradle_classpath_gap := {
  bug: "MainApplication.kt import + ExpoModulesProvider map entry alone is NOT sufficient",
  recurred: ["haptics/clipboard/battery 2026-07", "device/application/crypto 2026-07-29"],
  root_cause: "settings.gradle exclude-list resolver (§7) only makes the Gradle subproject
               EXIST — it doesn't add it to :app's compile classpath",
  fix: "app/build.gradle dependencies{} needs `implementation project(':expo-<pkg>')` too —
        manual, per package",
  symptom: ":app:compileDebugKotlin fails `Unresolved reference '<pkg>'` on the just-added
            MainApplication.kt import",
  not_caught_by: "tsc/vue-tsc/ngc — never touch Gradle/Kotlin",
  checklist: ["settings.gradle — automatic via exclude-list, no edit",
              "app/build.gradle — implementation project(':expo-<pkg>') — manual",
              "MainApplication.kt — import + map entry — manual"],
  verify: "run :app:compileDebugKotlin (or equivalent Gradle task), not just a JS typecheck",
}
```

Wire this into `examples/<app>`. `examples/react` currently exists only as a bare, unwired RN
scaffold (no `use_expo_modules!`, no Gradle fallback, doesn't even depend on
`@symbiote-native/sensors`) — every `examples/react` path in the narrative below describes
where the work *should* live per convention, not where it *does* live on disk today. Before
repeating any step below, `grep -n -i expo` the Podfile to confirm the wiring is actually
there — don't assume the convention held. Once wired once at
the app level, any *future* expo-modules-core-based package is auto-discovered with zero further
app changes — unlike the per-package `react-native.config.cjs`/podspec proxy the native-view
skill requires for every new RN-CLI-autolinked wrapper.

**iOS — done and verified end-to-end (2026-07, accelerometer pilot).** All fixes below are
reproduced directly in `examples/react/ios/Podfile` rather than worked around.

```
§4b_ios_bootstrap := {
  req1_use_expo_modules_reproduced: {
    why: "not a Podfile DSL method expo-modules-autolinking exposes — normally ships as a
          thin wrapper in expo's own scripts/autolinking.rb (`def use_expo_modules!;
          Expo::AutolinkingManager.new(...); end`), zero expo-package-specific logic, so the
          Podfile reproduces it verbatim",
    gotcha: "Podfile is instance_eval'd inside Pod::Podfile — `module Expo` (no leading ::)
             silently creates Pod::Podfile::Expo::AutolinkingManager instead of reopening the
             real top-level class; always `module ::Expo`",
  },
  req2_three_hardcoded_requires: {
    root_cause: "expo-modules-autolinking's Ruby hardcodes require('expo/bin/autolinking') in
                 THREE places though the CLI logic is 100% inside expo-modules-autolinking —
                 expo/bin/autolinking is a one-line wrapper
                 (require('expo-modules-autolinking/bin/expo-modules-autolinking')) existing
                 only as a resolution anchor assuming expo is installed",
    sites: ["Expo::AutolinkingManager#node_command_args (resolve AND
             generate-modules-provider at pod install time)",
            "Expo::PrecompiledModules.invoke_autolinking (2nd independent resolve path)",
            "Expo::ProjectIntegrator.generate_support_script — renders the '[Expo] Configure
             project' Xcode build-phase script, regenerated every pod install but EXECUTED on
             every build, so bites even after a green pod install"],
    fix: "monkey-patch all three in the Podfile — reopen module ::Expo, redefine each method,
          point the require string at expo-modules-autolinking/bin/expo-modules-autolinking",
  },
  req3_autolinking_direct_dep: {
    fix: "examples/react/package.json needs expo-modules-autolinking as a DIRECT dependency,
          pinned 57.0.5 — pnpm shamefully-hoist only hoists what's reachable from a project's
          own dependency graph, so without it Podfile's
          require.resolve('expo-modules-autolinking/...') fails even though packages/sensors
          resolves expo-sensors/expo-modules-core fine",
    not_needed: "expo-sensors/expo-modules-core — resolve transitively through
                 @symbiote-native/sensors; only the autolinking TOOL needed the direct edge",
    verified: "`expo-modules-autolinking.js resolve --platform ios --json` from examples/react
               lists expo-sensors (AccelerometerModule, BarometerModule, DeviceMotionModule,
               GyroscopeModule, MagnetometerModule, MagnetometerUncalibratedModule,
               PedometerModule), each appDelegateSubscribers: []",
  },
  pnpm_peer_trap: {
    bug: "pnpm auto-install-peers (default true) silently installs a real expo@57.0.4 (+
          expo-asset/expo-constants/expo-file-system/expo-font/expo-keep-awake/
          @expo/dom-webview/@expo/log-box) — expo-sensors declares
          peerDependencies:{expo:'*'} with no peerDependenciesMeta marking it optional",
    symptom: "invisible from node_modules listing but visible to `expo-modules-autolinking
              resolve` (scans whole tree); un-excluded → Expo pod FAILS to build
              ('ExpoModulesCore/ExpoModulesCore.h file not found' — module map assumes the
              full expo package's build wiring)",
    fix: "use_expo_modules!(exclude: ['expo','expo-asset','expo-constants',
          'expo-file-system','expo-font','expo-keep-awake','@expo/dom-webview',
          '@expo/log-box']) — extend for every future unmarked-optional expo peer",
  },
  deployment_target_trap: {
    bug: "ExpoSensors.podspec pins s.platforms={:ios=>'16.4'}, above RN's
          min_ios_version_supported (15.1); CocoaPods checks pod-vs-target compat against the
          Podfile's `platform :ios, X` line, NOT pbxproj's IPHONEOS_DEPLOYMENT_TARGET —
          mismatch silently SKIPS the pod ('[!] [Expo] ExpoSensors was not linked: requires
          iOS 16.4 but app targets 15.1', a warning not an error)",
    fix: "platform :ios, [min_ios_version_supported.to_f, 16.4].max.to_s in Podfile + bump all
          four IPHONEOS_DEPLOYMENT_TARGET entries (target+project) in
          Canary.xcodeproj/project.pbxproj",
  },
  appdelegate_bootstrap: {
    resolved_question: "ExpoAppDelegateSubscriberManager alone NOT sufficient — but
                        expo-modules-core-only remains enough, needs real new native code",
    finding: "ExpoAppDelegateSubscriberManager only forwards UIApplicationDelegate lifecycle
              events to modules registering an app-delegate subscriber — expo-sensors
              registers zero (irrelevant to Accelerometer; wired anyway since
              expo-file-system needs it)",
    real_gate: "requireNativeModule('ExponentAccelerometer') needs global.expo.modules (JSI
                host object) installed — traced expo-modules-core/src/
                requireNativeModule.ts → AppContext.swift's prepareRuntime()/
                installExpoModulesHostObject()",
    upstream_trigger: "packages/expo/ios/AppDelegates/ExpoReactNativeFactory.mm's
                       host:didInitializeRuntime: (RCTHostDelegate callback on expo's own
                       RCTReactNativeFactory subclass) — lives in expo package, but every
                       symbol it calls (AppContext/EXAppContext, EXHostWrapper,
                       EXReactSchedulerDispatch) is expo-modules-core-only (verified by grep
                       across both packages)",
    fix: "examples/react/ios/Canary/SymbioteExpoModulesFactory.h + .mm subclasses
          RCTReactNativeFactory, implements host:didInitializeRuntime: in Objective-C++ (not
          Swift — can't express facebook::jsi::Runtime& directly), creates an EXAppContext,
          wires runtime + RuntimeSchedulerBinding, calls registerNativeModules;
          AppDelegate.swift instantiates it instead of stock RCTReactNativeFactory, forwards
          UIApplicationDelegate lifecycle methods to ExpoAppDelegateSubscriberManager",
    wiring_needs: ["new SWIFT_OBJC_BRIDGING_HEADER (Canary-Bridging-Header.h) — Swift app
                    targets don't auto-bridge own ObjC/C++ sources",
                   "matching `import ExpoModulesCore` access level across target's Swift
                    files (`internal import` — autogenerated ExpoModulesProvider.swift uses
                    internal import; mismatch → 'ambiguous implicit access level')"],
  },
  verified: [
    "1. resolve --platform ios --json → expo-sensors + 7 module classes resolve",
    "2. pod install → green (84 deps from Podfile, 83 total pods installed, Expo/ExpoAsset/
     etc. correctly excluded)",
    "3. grep -c AccelerometerModule Pods/Pods.xcodeproj/project.pbxproj → 4 (refs to real
     AccelerometerModule.swift via pnpm store, not copied into Pods/)",
    "4. Pods/Target Support Files/Pods-Canary/ExpoModulesProvider.swift lists (module:
     AccelerometerModule.self, name: nil) in getModuleClasses()",
    "5. xcodebuild ... build → BUILD SUCCEEDED, 0 errors, Xcode 26.6",
    "6. xcrun simctl install + launch → alive through native-bootstrap (JS bundle loading not
     exercised, no Metro server running this pass)",
  ],
}
```
   loading wasn't exercised (verify once `packages/sensors/src/core` + a demo screen exist).

```
§4c_stale_derivedData := {
  bug: "`find DerivedData/<Scheme>-*/.../ -name \"<Scheme>.app\" | head -1` can install a STALE
        build when 2+ DerivedData/<Scheme>-<hash> folders exist for the same scheme",
  root_cause: "every xcodebuild/Xcode-GUI build creates a NEW hash-suffixed folder; find's
               enumeration is filesystem order, not mtime order",
  symptom: "requireNativeModule('Expo<X>') throws 'Cannot find native module' though the module
            IS present in the just-verified ExpoModulesProvider.swift — installed binary
            predates the pod that ships it, autolinking is not broken",
  found: "2026-07-29, wiring brightness/cellular/network into examples/expo-react — xcodebuild
          named DerivedData/CanaryExpo-hdlsozxhqnyltibrvcnvojacmxmm/... but a separate
          find|head -1 picked CanaryExpo-epzwjurfnurzwsgcosfdwzwdurqi (older, pre-brightness)",
  fix: "never re-derive the .app path with a fresh glob — reuse the EXACT path xcodebuild
        printed in its build log, or sort by mtime: find ... -name \"*.app\" -exec stat -f '%m
        %N' {} \\; | sort -rn | head -1",
}
```

**Android — done and verified 2026-07 (accelerometer pilot).**

```
§4d_android_bootstrap := {
  hard_wall: "expo-autolinking-settings Gradle plugin (ExpoAutolinkingSettingsPlugin.kt,
              .vendors/expo origin/sdk-57 packages/expo-modules-autolinking/android/
              expo-gradle-plugin) hardcodes require.resolve('expo-modules-autolinking/
              package.json',{paths:[require.resolve('expo/package.json')]}), and the shared
              AutolinkingCommandBuilder.baseCommand (used by SettingsManager#resolve AND
              ExpoAutolinkingSettingsExtension.rnConfigCommand) hardcodes
              require('expo/bin/autolinking') — both compiled Kotlin, not overridable from
              settings.gradle, so expoAutolinking.useExpoModules() genuinely cannot run
              without the real expo package installed",
  fallback: "expo-module-gradle-plugin (inside expo-modules-core itself, not
             expo-modules-autolinking) ships a withoutAutolinkingPlugin Kotlin source set,
             active whenever the expoAutolinkingSettingsPlugin Gradle extra-property is unset;
             its AutolinkingIntegrationImpl.getExpoDependency() =
             project.rootProject.findProject(\":$name\") — expects the app to include() the
             Expo module projects itself",
  wiring: {
    settings_gradle: "pluginManagement{} (must stay first statement) runs
                      expo-modules-autolinking's CLI directly — `node ./node_modules/
                      expo-modules-autolinking/bin/expo-modules-autolinking.js resolve
                      --platform android --json` (real entry file, not the .bin/ shell shim) —
                      filters JSON to exactly expo-modules-core+expo-sensors before
                      includeBuild(expo-module-gradle-plugin) and include()-ing both with real
                      projectDirs. Filter needed because expo-sensors' peerDependencies list
                      expo:'*' unmarked-optional, so pnpm auto-install-peers +
                      shamefully-hoist make the WHOLE expo meta-package tree
                      filesystem-discoverable and the resolver reports it too. Verified: `cd
                      examples/react && ./node_modules/.bin/expo-modules-autolinking resolve
                      --platform android --json` lists all 10; only 2 wanted get include()-d",
    android_build_gradle: "classpath(\"expo.modules:expo-module-gradle-plugin\") added to root
                           buildscript{dependencies{}} — separate reason from includeBuild():
                           expo-modules-core/android/build.gradle and
                           expo-sensors/android/build.gradle both `import
                           expo.modules.plugin.gradle.ExpoModuleExtension` BEFORE their own
                           `apply plugin:` line — bare Groovy import only resolves via the
                           classic shared-root-buildscript-classpath convention;
                           pluginManagement.includeBuild() substitution doesn't extend to bare
                           imports compiled ahead of apply plugin:",
    app_build_gradle: "implementation project(':expo-modules-core') + project(':expo-sensors')
                       — no expo aggregator project to depend on transitively, :app depends on
                       both directly",
    main_application_kt: "needs a change, but NOT ExpoReactHostFactory/
                          ApplicationLifecycleDispatcher (expo-package-only, confirmed absent
                          from expo-modules-core/expo-modules-autolinking) — no expo aggregator
                          to generate expo.modules.ExpoModulesPackageList
                          (GeneratePackagesListTask is applied to expo's own build script, not
                          the app's). Fix: hand-written `SensorsModulesProvider : ModulesProvider`
                          (getModulesMap(): Map<Class<out Module>, String?>) listing
                          AccelerometerModule::class.java to \"ExponentAccelerometer\" (must
                          match AccelerometerModule.definition()'s Name(\"ExponentAccelerometer\")
                          — the key requireNativeModule(...) resolves by), passed with a plain
                          ReactAdapterPackage() into
                          expo.modules.adapters.react.ModuleRegistryAdapter (normal
                          ReactPackage), added to PackageList(this).packages via the file's own
                          pre-existing 'add manually here' comment",
    main_activity_kt: "no change needed — expo-modules-core's ReactLifecycleDelegate.kt
                       implements plain RN LifecycleEventListener+ActivityEventListener, wired
                       automatically via NativeModulesProxy inside ModuleRegistryAdapter, no
                       ReactActivityDelegateWrapper needed. AccelerometerModule.kt/
                       SensorProxy.kt confirmed: accelerometer path has NO runtime-permission
                       request (ACTIVITY_RECOGNITION is for step-counter sensors, not
                       Accelerometer) — revisit only for Pedometer/DeviceMotion",
    manifest: "no edit needed — expo-sensors' own AndroidManifest.xml
              (<uses-permission android:name=\"android.permission.ACTIVITY_RECOGNITION\"/>)
              merges automatically via standard Android manifest merger once expo-sensors is a
              real Gradle dependency of :app",
  },
  verified: [
    "1. resolve --platform android --json → lists expo-sensors + expo-modules-core",
    "2. ./gradlew projects → Root project 'Canary' lists Project ':expo-modules-core' +
     ':expo-sensors' + Included build ':expo-module-gradle-plugin'",
    "3. ./gradlew :app:assembleDebug → BUILD SUCCESSFUL (233 tasks, real device-grade compile)
     — both ran compileDebugKotlin/native buildCMakeDebug successfully",
    "4. classes*.dex from app-debug.apk grepped for
     Lexpo/modules/sensors/modules/AccelerometerModule;,
     Lexpo/modules/adapters/react/ModuleRegistryAdapter;, and
     Lcom/canary/SensorsModulesProvider; — all present in classes19.dex",
  ],
  tooling: "Java 17, ANDROID_HOME, ./gradlew, Gradle 9.3.1 via wrapper — real build, not
            best-effort static check",
}

§4e_sensorsmodulesprovider_needs_entry_per_sensor := {
  bug: "SensorsModulesProvider's map needs a new entry for EVERY sensor — easy to forget",
  found: "2026-07-16, after porting all 7 remaining sensor families: crashed
          'Cannot find native module ExpoBarometer'",
  root_cause: "settings.gradle's include() wiring links the WHOLE expo-sensors android/
               project, so every sensor's Module class compiles fine (confirmed in dex) — but
               compiling isn't registering; getModulesMap() still only listed
               AccelerometerModule (the pilot's one entry)",
  fix: "one `<SensorModule>::class.java to \"<Name(...) string>\"` line per sensor, matching
        each Module's own definition(){Name(\"...\")} exactly — confirmed for all 8:
        ExponentAccelerometer, ExpoBarometer, ExponentDeviceMotion, ExponentGyroscope,
        ExpoLightSensor, ExponentMagnetometer, ExponentMagnetometerUncalibrated,
        ExponentPedometer",
  note: "map is generated by §9's aggregator since 2026-08 — was hand-maintained when this was
         written",
  symptom: "no build error, no compile warning — only a runtime 'Cannot find native module'
            crash on first use",
}

§4f_two_more_ios_build_failures := {
  found: "2026-07-17, wiring the Vue-TSX canary — a green pod install does not catch either",
  source: "full fix + code kept in expo-native-module-setup.mdx's 'iOS — install the runtime
           hook' section, the two <Aside type=\"danger\"> blocks",
  failure_1: {
    bug: "expo-modules-autolinking's generate_support_script arity drifts across versions —
          57.0.8 calls it with 4 args (added target_name, forwarded as --target-name)",
    symptom: "a Podfile monkey-patch copied from an older 3-arg doc snippet raises
              `ArgumentError: wrong number of arguments (given 4, expected 3)` on pod install",
    fix: "verify the real arity in the installed copy before trusting any doc's exact
          signature",
  },
  failure_2: {
    bug: "SymbioteExpoModulesFactory.h/.mm dropped next to AppDelegate.swift are invisible to
          the Xcode project unless it uses Xcode 16 file-system-synchronized groups (check for
          PBXFileSystemSynchronizedRootGroup in project.pbxproj) — most RN templates don't",
    symptom: "linking fails `Undefined symbols … _OBJC_CLASS_$_SymbioteExpoModulesFactory`",
    fix: "explicit PBXFileReference + Sources build-phase membership via the xcodeproj gem;
          separately bump the APP TARGET's own IPHONEOS_DEPLOYMENT_TARGET (not just the
          Podfile's platform :ios line, which only governs Pod-to-Pod compat) to match
          ExpoModulesCore's floor once AppDelegate.swift imports it directly — else `compiling
          for iOS 15.1, but module 'ExpoModulesCore' has a minimum deployment target of iOS
          16.4`",
  },
}
```

## 5. Permissions ship with the wrapped native code — do not reimplement

Native permission handling for a sensor family is part of its native module, already
autolinked for free per §2 — not something to write yourself. For `Accelerometer` on iOS:
`packages/expo-sensors/ios/EXMotionPermissionRequester.h/.m` already exists upstream; the app
side only needs an `NSMotionUsageDescription` entry in Info.plist. Android needs its own
runtime permission request. Every sensor family may need its own platform permission string —
check the specific sensor's native folder before assuming Accelerometer's permission shape
generalizes to e.g. Pedometer or DeviceMotion.

## 6. Testing — no Fabric/Descriptor angle at all

Every other wrapper in this repo (`slider`, `splash-screen`) eventually touches a Fabric view,
so this repo's `ADR-0025` `installFabric()`-based headless harness is the default testing
pattern. A pure native-module wrapper has **no view**, so that harness does not apply here —
do not reach for `installFabric()`/`fabric.find`/`fabric.fireEvent` for this shape of package.

The correct precedent is upstream's own test pattern, verified in
`expo-sensors/src/__tests__/Accelerometer-test.native.ts` and
`expo-sensors/mocks/ExponentAccelerometer.ts`: inject a fake native-module object in place of
the real `requireNativeModule` resolution (a plain object with `vi.fn()`/stub
`addListener`/`isAvailableAsync`/`setUpdateInterval`), then assert against it directly —
e.g. `Accelerometer._nativeModule.setUpdateInterval` was called with the right args. No Fabric
fake, no ViewConfig, no `installFabric()`.

```
§6a_ios_sim_no_imu := {
  fact: "iOS Simulator has no real IMU/pedometer hardware — isAvailableAsync() genuinely
         returns false for every CoreMotion-backed sensor (Accelerometer, Gyroscope,
         Magnetometer, DeviceMotion) and CMPedometer-backed Pedometer",
  symptom: "subscription still succeeds (addListener doesn't throw), just never fires —
            indistinguishable from 'still waiting for first reading' unless UI checks
            isAvailableAsync() separately",
  verified: "2026-07-16, sensors pilot demo screen: every sensor false on iPhone 17 / iOS
             26.5 Simulator",
  not_a_bug: "expected — real readings need a physical device",
  rule: "render the availability check as its own state, not conflated with 'no reading yet'
         (frontend-ux-best-practices 'render every async state') — else looks identical to a
         real bug",
}

§6b_ios_sim_no_brightness := {
  fact: "iOS Simulator does not implement UIScreen.main.brightness at all — expo-brightness
         get/set never round-trips there, only on a real device; Android emulator unaffected",
  impl: "BrightnessModule.swift's setBrightnessAsync/getBrightnessAsync are a bare
         UIScreen.main.brightness = value / return UIScreen.main.brightness — real call, not
         a stub",
  symptom: "Simulator: set silently no-ops, get always returns a constant (observed 1.0)
            regardless of what was written — long-standing Apple Simulator limitation,
            reproducible in stock Expo Go too, not fixable in this wrapper",
  android_contrast: "WindowManager.LayoutParams.screenBrightness has no such gap — emulator
                     runs the same framework path as a real device, value genuinely persists",
  verified: "2026-07-29, examples/expo-react's BrightnessScreen: brightness button updates
             displayed % on Android but not iOS Simulator — here even the SOFTWARE readback
             fails, not just the physical dimming",
}

§6c_vitest_flow_parse_crash := {
  bug: "importing UnavailabilityError (or anything) as a real VALUE from expo-modules-core
        crashes Vitest: `Parse failure: Flow is not supported`",
  root_cause: "real expo-modules-core entry transitively imports react-native, whose
               Flow-typed source Vitest's Oxc transform can't parse; a `type`-only import
               (EventSubscription etc.) never hits this — types are erased, real module never
               loads",
  scope: "battery's core test never needed the fix; network's and brightness's did the moment
          they added the UnavailabilityError throw-on-missing-method convention",
  fix: "vi.mock('expo-modules-core', () => ({ UnavailabilityError: class UnavailabilityError
        extends Error {}, Platform: { OS: 'ios' }, PermissionStatus: { GRANTED: 'granted',
        DENIED: 'denied', UNDETERMINED: 'undetermined' } })) — mock only the members the file
        under test imports as values",
  precedent: "packages/haptics/src/core/haptics.test.ts — check before writing a new core
              test for any package throwing UnavailabilityError or reading Platform.OS",
}
```

## 7. `settings.gradle` allow-list → exclude-list — the pattern that scales past 2 packages

```
§7_allowlist_to_excludelist := {
  superseded: "§4's Android recipe (filter expo-modules-autolinking resolve JSON to exactly
               expo-modules-core+expo-sensors) was an ALLOW-list, written for the 2-package
               pilot — every future package needed a new name added by hand",
  bug: "doesn't scale past a handful of packages — allow-list fix alone left new packages
        silently unlinked (project simply not included, distinct symptom from the runtime
        'Cannot find native module' error, same root cause: a filter that must be told about
        every new package by name)",
  found: "2026-07-28, adding expo-haptics/expo-clipboard/expo-battery to all four
          examples/expo-* canaries (public tarball-installed apps, not examples/react)",
  fix: "flip to an EXCLUDE-list of known phantom npm-peer packages, mirroring the iOS
        Podfile's use_expo_modules!(exclude:[...]):\n```groovy\ndef unwantedExpoModules = [\n  \"expo\", \"expo-asset\", \"expo-constants\", \"expo-file-system\",\n  \"expo-font\", \"expo-keep-awake\", \"@expo/dom-webview\", \"@expo/log-box\",\n]\ndef wantedExpoModules = resolvedExpoModules.modules\n  .findAll { !unwantedExpoModules.contains(it.packageName) }\n```",
  verified: "simulated against real resolve --platform android --json output → yields exactly
             the wanted 6-package set, zero manual per-package entries",
  scope: "use exclude-list for any app with 2+ expo-modules-core packages wired; §4's
          allow-list is fine only for a from-scratch single/two-package pilot",
  does_not_remove: "app/build.gradle's implementation project(':expo-<pkg>') and
                    MainApplication.kt's ExpoModulesProvider map (§4's SensorsModulesProvider)
                    still need one new line each per package (§9's aggregator now generates
                    both, no longer hand-edited, but still a distinct registration point
                    settings.gradle alone doesn't cover) — settings.gradle only answers 'is
                    this Gradle subproject included at all'",
  confirmed_gaps: "hit both for real adding these three packages: skipping app/build.gradle
                   fails :app:compileDebugKotlin `Unresolved reference '<pkg>'`; skipping
                   MainApplication.kt map entry compiles+installs fine but crashes at first
                   use `Cannot find native module '<Name>'` — same symptom as §6, reproduced
                   identically for a second unrelated package set, confirming it's general to
                   this Android wiring shape, not accelerometer-specific",
}
```

## 7. Package shape — mirrors `splash-screen`, not `slider`

Both `splash-screen` and an Expo-native-module wrapper are non-view wrappers; `slider` is a
native-view wrapper and needs ViewConfig/Descriptor bridging that doesn't apply here. Use
`packages/splash-screen/package.json`'s exports map as the literal template:

```
packages/<lib>/
  package.json        exports: "." -> src/core/index.ts, "./react", "./vue", "./angular"
                      dependencies: <upstream-pkg> (native-only, exact version pin),
                                    expo-modules-core
  src/core/           ported base class + per-module class + native-module resolution
                      one-liners, framework-agnostic
  src/react/hooks/    thin lifecycle wrapper (useEffect + addListener/remove)
  src/vue/composables/  thin lifecycle wrapper (ref + onUnmounted)
  src/angular/services/ thin lifecycle wrapper (Injectable, subscribe/unsubscribe)
```

For `@symbiote-native/sensors` specifically: hooks/composables/services ship from day one (not
deferred to a later pass — decided explicitly over a core-only-v1 alternative), iOS+Android only
(upstream's `.web.ts` variants are not ported). First adapter to verify end-to-end (native
linking + hooks on a real/simulated device) is `examples/react`, per this repo's "prove the
pattern in React first" convention (see the Workstream B pilot-order precedent for
`core/components`); Vue/Angular are wired and demoed afterward using the hooks/composables/
services that already exist from day one.

When porting several sensor families from the same upstream package in one pass, dispatch one
agent per sensor and have none of them touch the shared `core/index.ts`/`react/index.ts`/
`vue/index.ts`/`angular/index.ts` barrels — merge those by hand afterward, otherwise concurrent
agents conflict on the same file.

Beyond the uniform `DeviceSensor` subclass + `addListener`/`setUpdateInterval` recipe, two shape
variants can show up — read these before wrapping the next Expo sensor-shaped module:

- **Platform-split native module (`LightSensor`)**: when upstream ships a real native module on
  one platform and a JS-level stub on the other (`ExpoLightSensor.ts` vs `ExpoLightSensor.ios.ts`
  always reporting unavailable), port it as a FOLDER under `core/native/` following this repo's
  folder-as-module convention (`exponent-light-sensor/{index.ts,index.ios.ts,index.android.ts}`),
  not a flat file — `index.ts` re-exports the stub variant so headless/vitest resolution never
  calls `requireNativeModule` outside a real RN runtime, while Metro still picks the real
  per-platform file at bundle time.
- **Free-function module, not a `DeviceSensor` subclass (`Pedometer`)**: not every Expo sensor
  fits the `addListener`/`setUpdateInterval`/`isAvailableAsync` class shape — `Pedometer` upstream
  is a set of free functions (`watchStepCount`, `getStepCountAsync`, plain permission functions)
  with no shared instance to hang state off. Port it as free functions in `core/pedometer.ts`
  (do NOT force it to extend `DeviceSensor`), and give it a reactive hook/composable/service that
  wraps `watchStepCount` in the same subscribe-on-mount/unsubscribe-on-unmount shape as every
  other sensor's hook, for cross-framework consistency, while leaving the one-shot async functions
  (`getStepCountAsync`, `isAvailableAsync`, permission functions) as plain re-exports from the
  barrel — no adapter-specific wrapping needed since they're already framework-agnostic.

## 8. Resolved — `DeviceMotion` on Android needed NO native fix; three debugging-methodology
   traps caused the whole illusion of a bug

```
§8_devicemotion_android := {
  tldr: "the original, unpatched expo-sensors DeviceMotion module works fine, including
         nested fields (rotation/acceleration/…) — clean-slate control test (adb uninstall +
         fresh installDebug, fully reverted to upstream's unpatched DeviceMotionModule.kt)
         rendered perfectly. Nothing needed fixing in expo-sensors, no native fork needed.
         All 3 things that mattered were debugging-methodology bugs on our side",
  investigation: "2026-07-16 — patched away half the Kotlin module across 7 rebuild
                  iterations chasing phantom causes, then built + A/B-tested a full native
                  fork over a real but unrelated upstream bug",
  trap_1_dumpsys: {
    bug: "adb shell dumpsys window windows' surface=[…] line treated as proof of a corrupted
          window — NOT a reliable signal",
    disproven: "same surface=[0,0][0,0] value appears on a build that renders perfectly fine
                (confirmed by screenshot) — apparently always zero in this dump
                format/Android version regardless of actual window state",
    fix: "only trustworthy signal is an actual screenshot (mobile_take_screenshot or
          equivalent); never cite this dumpsys field again",
  },
  trap_2_installDebug_stale_state: {
    bug: "./gradlew installDebug does NOT clear app/task state — adb uninstall does",
    root_cause: "installDebug is an incremental reinstall, doesn't wipe persistent data or
                 cached Activity/task state",
    symptom: "~7 rebuild-and-installDebug cycles (interval-unit fix, removing Choreographer,
              removing legacy UIManager bridge hop, stubbing getOrientation(), cutting 5
              sensors to 1, renaming the module, lazy-vs-eager Gravity read) kept rendering
              blank regardless of which change was live — corrupted state from the FIRST run
              never cleared",
    fix: "adb uninstall com.canary before reinstalling → original unpatched module rendered
          correctly first try",
    rule: "any Android UI/rendering bug investigation must start with `adb uninstall
           <package>` before the first test AND before trusting any 'still broken'/'now
           fixed' result — installDebug-only cycles give false results in both directions",
  },
  trap_3_real_culprit_unguarded_read: {
    symptom: "deviceMotion.interval (flat) always worked; deviceMotion.rotation.alpha (nested)
              reliably blanked the screen — healthy commit log right up to failure then
              silence, no JS error, no native crash, no logcat exception",
    ruled_out: "expo-modules-core JSTypeConverterProvider.convertToJSValue
                (android/.../types/JSTypeConverterProvider.kt) branches on
                useExperimentalConverter for Map/Collection/FormattedRecord but NOT Bundle
                (`is Bundle -> value.toJSValue(containerProvider)` always legacy vs `is
                Map<*,*> -> if (useExperimentalConverter) …`) — real, confirmed upstream bug
                (still present on expo/expo main), but A/B test (native Map-based fork of
                DeviceMotionModule.kt vs unpatched Bundle-based original, 4 clean
                adb-uninstall trials each) showed NO difference — not the cause, don't fork
                DeviceMotionModule.kt over it",
    root_cause: "JS demo code read deviceMotion.rotation.alpha unconditionally, guarded only
                 by `deviceMotion && …` not `deviceMotion?.rotation && …`; Android's
                 TYPE_ROTATION_VECTOR sensor (and TYPE_LINEAR_ACCELERATION/
                 TYPE_ACCELEROMETER/TYPE_GYROSCOPE) may not have a reading by the FIRST
                 deviceMotionDidUpdate event — DeviceMotionModule.kt's eventsToMap() only
                 includes a nested key once that sensor has produced ≥1 event, so the first
                 event can legitimately arrive without `rotation` — unguarded read throws
                 `TypeError: Cannot read property 'alpha' of undefined`, swallowed silently
                 (no LogBox, no logcat, no crash)",
    fix: "guard the full chain: `deviceMotion?.rotation && …`, not just the top-level object
          — applies to any nested DeviceMotion field, any adapter",
    open: "why the throw is swallowed with zero visible trace not root-caused further —
           candidate: expo-modules-core's EventEmitter/emitEvent callback path may not route
           through React's normal error boundary",
    retroactive: "explains the earlier '5-for-5 nested fails vs 4-for-4 flat succeeds'
                  pattern from the same investigation — almost certainly the same unguarded
                  read, not a native marshaling bug",
    lesson: "a 'no exception anywhere, screen blanks, rendering just stops' symptom in this
             project is NOT proof of a native-layer bug — check unguarded nested-optional
             reads in JS FIRST, before the native side. Treat 'screen went blank' as a JS
             null-safety bug by default, not JSI marshaling, until an actual A/B test proves
             otherwise",
  },
  current_state: "examples/react's SensorsScreen.tsx: DeviceMotion wired as first-class
                  sensor alongside Accelerometer/Gyroscope/Magnetometer/Pedometer, fully
                  unpatched native module (no pnpm patch, no native fork), renders interval
                  (flat) + rotation (nested, deviceMotion?.rotation-guarded)",
}

§8a_ios_simulator_quirks := {
  drift: "CMMotionManager on iOS Simulator (~Xcode 11+) synthesizes noisy/drifting motion
          data on a stationary device — no real IMU; expected, not a wiring bug",
  nan: "rotation.beta can read NaN, alpha≈-gamma — DeviceMotionModule.swift reports
        rotation.{alpha,beta,gamma} straight from CMAttitude.{yaw,pitch,roll} (Euler
        angles); gimbal lock at pitch≈±90° makes yaw/roll indistinguishable and can push
        asin(...) past ±1 → NaN. Inherent to Euler-angle attitude (same as web
        DeviceOrientationEvent.beta/.gamma), not an expo-sensors or wrapper bug. Consumer
        fix: Number.isNaN(...) check, nothing to fix natively",
}

§8b_android_localauth_not_enrolled := {
  symptom: "authenticateAsync() fails `not_enrolled (KeyguardManager#isDeviceSecure()
            returned false)` — reads like a missing-permission bug",
  root_cause: "LocalAuthenticationModule.kt's authenticateAsync checks
               keyguardManager.isDeviceSecure (pure device-state query, zero permission
               involved) before touching BiometricPrompt; USE_BIOMETRIC/USE_FINGERPRINT are
               normal manifest permissions merged automatically; confirmed zero
               requestPermissions calls in this path",
  fix: "device-side only: Settings → Security → Screen lock → set PIN/pattern; for an AVD,
        Extended Controls → Fingerprint → enroll one to test biometric specifically",
  scope: "same shape as §8a — hardware/OS state masquerading as an app bug",
}
```

## 9. `@symbiote-native/expo-modules-link` - the hand-maintained-registration pain from §4/§7 is now automated (2026-07, redesigned as an aggregator 2026-08-05)

The recurring Android pain documented above and in §7's "This does NOT remove the other two
registration points" note — `app/build.gradle`'s `implementation project(':expo-<pkg>')` and
`MainApplication.kt`'s hand-maintained `ModulesProvider` map, both needing one new line per
package with no compile error on omission, only a runtime `Cannot find native module` crash —
is now closed by `packages/expo-modules-link`.

**It is an aggregator: ONE process, ONE pass over the app's `node_modules`, regenerating the
registration blocks from scratch.** The app - not the wrapper package - owns the trigger:

```json
{
  "dependencies": { "@symbiote-native/expo-modules-link": "^0.2.0" },
  "scripts": { "postinstall": "symbiote-expo-link" }
}
```

Wrapper packages have NO `postinstall` and do NOT depend on `expo-modules-link`. They ship a
passive `native-link.json` manifest and nothing else. **Do not add a `postinstall` back to a
wrapper package** - that is the design this was moved away from, for the reason in "Why an
aggregator" below.

**Mechanism.** Each wrapper package (sensors, local-auth, haptics, clipboard, battery,
brightness, cellular, network, device, application, crypto, ...) ships a `native-link.json`
next to its `package.json`:

```json
{
  "android": {
    "gradleProjectName": "expo-local-authentication",
    "modules": [
      { "importPath": "expo.modules.localauthentication.LocalAuthenticationModule",
        "className": "LocalAuthenticationModule", "nativeName": "ExpoLocalAuthentication" }
    ]
  }
}
```

`symbiote-expo-link` (the package's `bin`) runs from the app root, scans
`<app>/node_modules/*` and `<app>/node_modules/@scope/*` for every installed package shipping a
`native-link.json`, sorts them by package name, and rewrites two regions from that list. Each
region is delimited by a marker PAIR and the generator owns everything between them; everything
outside is the developer's and is never touched:

- `app/build.gradle`: a `// SYMBIOTE-EXPO-LINK:BEGIN DEPENDENCIES` … `:END DEPENDENCIES` region
  holding one sorted `implementation project(':<gradleProjectName>')` per package. Created once
  right after the `implementation("com.facebook.react:react-android")` anchor line.
- `MainApplication.kt`: TWO regions - `:BEGIN IMPORTS` (created after the last existing import)
  and `:BEGIN MODULES-MAP` (created after the
  `override fun getModulesMap(): Map<Class<out Module>, String?> = mapOf(` anchor).

Writes go through a temp-file + `renameSync`, so an interrupted install cannot leave a
half-written `build.gradle`. A `BEGIN` whose `END` was hand-deleted is REFUSED with a warning
rather than guessed at - guessing where the region ends would eat the developer's code.

```
§9a_aggregator_vs_per_package_postinstall := {
  original_design: "every wrapper package's own postinstall appends its own line — correct for
                    ORDER, not CONCURRENCY",
  bug: "npm 7+/pnpm run independent deps' lifecycle scripts in PARALLEL — N OS processes did
        read-modify-write on the same file; two could read the same snapshot before either
        wrote back, later write silently dropped the earlier line — well-formed file missing
        an entry, only surfacing at runtime as `Cannot find native module`",
  reproduced: "wiring 6 new packages into examples/expo-angular/expo-vue-sfc at once — one npm
              install landed 4-5 of 6",
  lock_designs_tried: [
    "unlink then re-open(O_EXCL) with no re-check — failed ~1 in 5 runs",
    "rename(tmp, lock) 'clobber and read back' — rename always succeeds, no only-one-winner
     signal at all — failed ~3 in 10, worse: every racer thinks it won",
    "pid-liveness + same-content re-check immediately before unlink — narrowed to ~1 lost
     registration in 100 installs, could not close it",
  ],
  why_unfixable: "no compare-and-unlink and no flock in plain fs — 'decide holder is dead' and
                  'act on it' stay two separate steps; another process can legitimately
                  recreate the lock in between and have its live lock unlinked by the race
                  loser. proper-lockfile doesn't close it either — its mtime-refresh
                  (onCompromised) DETECTS a stolen lock rather than preventing the steal, and
                  its setTimeout refresh never fires since the critical section is fully
                  synchronous",
  fix: "delete the concurrency instead of synchronising it (same approach
        expo-modules-autolinking itself uses) — one process reads the installed tree and
        writes the answer",
  bonus: "output deterministic (sorted, committed native files stop churning per-machine),
          uninstall finally works (append-only patcher could only grow), no lock artifacts to
          leak/gitignore",
  warning: "reintroducing per-package postinstall linking reintroduces this race — the lock is
            not a missing feature to add back, it cannot be built correctly at this layer",
}
```

**What this replaces, what it doesn't.** Adding a NEW expo-modules-core package no longer needs
a hand-edit to either file in any consuming app — this closes the exact gap §7 flagged as
NOT solved by the `settings.gradle` exclude-list. iOS per-package *linking* already self-healed
via its own `use_expo_modules!(exclude: [...])` (§`Accepted side effect`) before this package
existed, so there was no recurring gap to close there — but a second, genuinely recurring iOS
gap DID exist and is now also closed: per-package `Info.plist` usage-description strings (see
below). The one-time per-app bootstrap (Podfile `use_expo_modules!` monkey-patch reproduction,
`SymbioteExpoModulesFactory`, bridging header) remains fully manual either way — it is a
one-time, whole-Xcode-project operation, not a per-package one, so it was never in scope.

```
§9b_ios_infoplist_permission_strings := {
  added: "2026-08-03",
  shape: "package needing a usage-description key (local-auth → NSFaceIDUsageDescription,
          sensors → NSMotionUsageDescription, tracking-transparency →
          NSUserTrackingUsageDescription) declares it in its own native-link.json under
          ios.infoPlistKeys: { \"<KEY>\": \"<default text>\" }",
  mechanism: "patchInfoPlist finds the app's Info.plist (walks ios/, skips
              Pods/build/DerivedData/*Tests*), inserts the key before the outermost closing
              </dict> iff that exact <key>NAME</key> isn't already present anywhere. XML-escapes
              (&,<,>) on the way in — an unescaped & produces a plist no parser will read, and
              the failure surfaces as an opaque build error far from its cause",
  no_generated_region: "unlike the two Android blocks — Xcode rewrites Info.plist through its
                        own plist serializer on target-setting changes and DROPS XML comments,
                        so a lost END marker would insert a duplicate block → invalid plist.
                        iOS stays additive; key-presence alone is the idempotency check (a
                        plist key is unique by construction)",
  default_text_rule: "must be generic, never copy a specific app's wording. Caught mid-session:
                      first draft used examples/expo-react's live text ('CanaryExpo uses Face
                      ID to demo @symbiote-native/local-auth.') as the shipped default — would
                      have put one demo app's name into every future consumer's Info.plist. No
                      per-app config file to read a custom string from (unlike Expo's own
                      config-plugins pulling from app.json), so default names no app: 'This app
                      uses Face ID to authenticate you.'",
  override: "free consequence of additive-only design, not a built feature — check is 'does
             this <key> already exist', never 'does its value match the default', so an app
             overrides by having the key present before or after install; every future run
             leaves it alone permanently. examples/expo-{angular,vue-sfc,vue-tsx} deliberately
             keep demo-specific wording as a live example of the override",
  drift_notice: "since 2026-08-05, a disagreeing value prints a one-line notice naming both,
                unconditionally (not DEBUG-gated) — file left as written, point is drift stops
                being invisible, not gets corrected. Running the aggregator over those three
                apps is what surfaced the drift in the first place",
}

§9c_android_application_attributes := {
  added: "2026-08-05, for secure-store",
  shape: "android.manifestApplicationAttributes: { \"<attr>\": \"<value>\" } sets attributes on
          the app's <application> element in android/app/src/main/AndroidManifest.xml",
  why: "secure-store needs android:fullBackupContent / android:dataExtractionRules pointing at
        expo-secure-store's own Auto Backup rule files — without them Android backs up the
        encrypted entries but not the Keystore keys that decrypt them, so restore onto a new
        device yields unreadable values",
  additive_only: "same reason as Info.plist plus one of its own — XML attribute is unique per
                  element by construction (presence check sufficient) and no comment can live
                  inside a tag to delimit a region anyway; an attribute the app already carries
                  is kept+reported since backup rules decide what leaves the device, app's own
                  value wins",
  parse_detail: "opening tag located by scanning for the first UNQUOTED > after <application>,
                not regex — RN's own template puts \"${usesCleartextTraffic}\" in an attribute
                and a manifest may legally put a > inside one",
}

§9d_generalisation := "read the upstream package's own plugin/src/with<Name>.ts before porting
  it — that's where Expo hides per-app native config a thin JS wrapper never reveals.
  expo-secure-store's does exactly two things: NSFaceIDUsageDescription (linker already
  covered) and the two manifest attributes (it did not). Tier 1 packages needed nothing there,
  so this only surfaced on the first tier-2 package."

§9e_verified := {
  ios_2026_08_03: "same methodology as Android proof, with one wrinkle: after repacking
                   local-auth's tarball, the permission string still didn't appear —
                   @symbiote-native/expo-modules-link ITSELF was still the stale
                   pre-iOS-support tarball. A transitive dependency's postinstall doesn't
                   retrigger just because you updated the dependency — force-reinstall the
                   dependency THEN the package depending on it, in that order",
  android_2026_07_30: "stripped local-auth's three registration lines (import, map entry,
                       gradle dependency) from the real committed examples/expo-react android
                       files, ran a genuine npm install, confirmed symbiote-expo-link
                       re-derived the exact same lines — proof against a real npm install, not
                       only synthetic fixtures",
}

§9f_npm_stale_file_tarball_gotcha := {
  bug: "npm install can silently skip re-extracting a file: tarball dependency if repacked
        (e.g. pnpm pack) without bumping its version — will recur for anyone iterating on a
        file:-referenced package",
  root_cause: "package-lock.json records an integrity hash for the file: resolution; plain npm
               install trusts that recorded hash/resolution instead of recomputing against the
               tarball's current content — repacked-but-unversioned content (e.g. a newly-added
               postinstall script) never reaches node_modules, ZERO warning",
  confirmed: "after repacking packages/local-auth, node_modules/@symbiote-native/local-auth/
             package.json in examples/expo-react still had no postinstall field and no
             native-link.json, identical to before the repack",
  fix: "delete node_modules/@scope/<pkg> before npm install (forces fresh extraction), or
        `npm install \"@scope/<pkg>@file:../../relative/path/to/the.tgz\"` to force npm to
        recompute resolution+integrity",
  scope: "purely a local-tarball-dev-loop trap — a real npm consumer bumping the published
          version never hits this",
}
```

## Still-open execution checklist (nothing below has shipped yet)

1. `packages/sensors/package.json` + `tsconfig.json`; add to root `tsconfig.json` references
   and `vitest.config.ts` include.
2. Port `core/device-sensor.ts`, per-sensor core class + native-module resolution + types, the
   `react/hooks`/`vue/composables`/`angular/services` lifecycle wrapper per sensor, and tests
   adapting upstream's mock-native-module pattern (§6) — see §7 for the two shape variants.
3. One-time `examples/react` native wiring: Podfile `use_expo_modules!`, Android Gradle
   autolinking apply, `NSMotionUsageDescription` in Info.plist, AppDelegate/MainApplication
   bootstrap, Android runtime permission — see §4 (`SymbioteExpoModulesFactory` on iOS) and the
   dedicated Android section above this checklist.
4. Verify: `pod install` then grep `Pods.xcodeproj/project.pbxproj` for the native module
   class; Android Gradle autolinking generation succeeds; `xcodebuild`/`gradlew assembleDebug`
   both build; simulator install+launch with no crash.
5. Demo screen in `examples/react`, confirm on simulator/device (final word per ADR-0012 —
   real device, not headless).
6. Wire the same hooks/composables/services into `examples/vue-*` and `examples/angular`.

## References

- `symbiote-new-package-skeleton` — read FIRST if the package doesn't exist yet at all: resolves
  whether a brand-new package should start as a bare-skeleton (reserve-the-npm-name only, no
  functional code — see `packages/local-auth`), core-only, or the full parity this skill
  otherwise assumes.
- `symbiote-third-party-native-view` — the native-VIEW sibling skill; read it first if the
  package you're wrapping has a `codegenNativeComponent`. The `.rn-<lib>` vendoring recipe and
  the CocoaPods symlink-glob gotcha it documents do **not** apply to expo-modules-core-based
  packages (§2 above).
- `packages/splash-screen` — the package-shape template (exports map, core/adapter split) for
  a non-view wrapper.
- `packages/expo-modules-link` - the app-level registration aggregator (§9) that generates the
  `app/build.gradle`/`MainApplication.kt` blocks from every installed package's
  `native-link.json`; read its own README for the manifest shape and the app-side setup.
- `symbiote-sfc-style-compiler` / root CLAUDE.md Build & platform section — this repo's own
  Metro pipeline, the reason `expo`'s own Metro config/babel preset must never be installed.
- `.vendors/expo` — shared git checkout across projects via the `.vendors` symlink; read a
  specific SDK's files with `git -C .vendors/expo show origin/sdk-57:<path>` (fetch the ref
  first if missing), never `git checkout`/switch its branch.
- `symbiote-docs-site-package-template` — once the wrapper package is done, read this for the
  docs-site `.mdx` page's canonical `## API` section shape (Signature/config/return-value
  sub-tables fit an Expo module's async-function + hook surface, same as `splash-screen`'s).
