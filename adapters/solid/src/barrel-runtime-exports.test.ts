// About half of this barrel is names re-exported verbatim from @symbiote-native/engine and
// @symbiote-native/components. Two ways that breaks without tsc noticing: a value written into a
// `export type { … }` block vanishes at runtime, and a value re-exported from a module that no
// longer defines it resolves to `undefined` through the re-export chain. Either way an app imports
// the name and gets nothing. tests/adapter-barrel-parity.test.ts reads the barrels as SOURCE
// (types would otherwise be invisible to it), so it sees neither — this pins the value half by
// actually importing them.
//
// Types are deliberately not listed: `import * as` cannot see them, and the source-level parity
// gate already covers that half.

import { describe, expect, it } from 'vitest';

import * as barrel from './index';

// Pure utilities, the color surface, the app-entry seams, and the diagnostics gate.
const ENGINE_UTILITIES = [
  'Platform',
  'StyleSheet',
  'PixelRatio',
  'PlatformColor',
  'DynamicColorIOS',
  'processColor',
  'setNativeViewConfigSource',
  'setColorProcessor',
  'setDeviceEventSource',
  'dlog',
  'isDebug',
];

// The imperative modules of <runtime_modules_layering>, plus the two interaction subsystems.
const ENGINE_MODULES = [
  'Alert',
  'Share',
  'ActionSheetIOS',
  'Linking',
  'Vibration',
  'ToastAndroid',
  'Settings',
  'I18nManager',
  'Dimensions',
  'Appearance',
  'AppState',
  'Keyboard',
  'KEYBOARD_EVENT',
  'BackHandler',
  'PermissionsAndroid',
  'PERMISSIONS',
  'RESULTS',
  'LayoutAnimation',
  'InteractionManager',
  'PanResponder',
  'AccessibilityInfo',
];

const COMPONENTS_VALUES = ['setImageSourceResolver'];

// The adapter's own surface — the reconciler wiring plus solid-js's control flow, which is
// re-exported here rather than re-implemented.
const ADAPTER_VALUES = [
  'mount',
  'unmount',
  'findNodeHandle',
  'descriptorToSolid',
  'AppRegistry',
  'setHostRegistrar',
  'View',
  'Text',
  'SafeAreaView',
  'Image',
  'Pressable',
  'ActivityIndicator',
  'Switch',
  'TextInput',
  'Modal',
  'KeyboardAvoidingView',
  'RefreshControl',
  'ScrollView',
  'VirtualizedList',
  'FlatList',
  'VirtualizedSectionList',
  'SectionList',
  'For',
  'Index',
  'Show',
  'ErrorBoundary',
  'Suspense',
  'SuspenseList',
];

// No Negative group: every claim here is Positive ("the name resolves to a value"). A broken
// re-export produces `undefined`, which is reported as a FAILURE rather than asserted as a throw.
describe('@symbiote-native/solid barrel, runtime half', () => {
  // why: a missing or type-only-by-accident re-export is invisible to tsc and to the source-level
  // parity gate, and only surfaces when an app calls the name.
  it.each([
    ['engine utilities', ENGINE_UTILITIES],
    ['engine runtime modules', ENGINE_MODULES],
    ['components values', COMPONENTS_VALUES],
    ['adapter surface', ADAPTER_VALUES],
  ])('resolves every %s name to a value', (_group, expected) => {
    // Object.entries rather than a keyed lookup: it reads through the namespace's getters and
    // needs no index signature, so no `as` is involved.
    const resolved = new Map<string, unknown>(Object.entries(barrel));
    const unresolved = expected.filter(
      name => resolved.get(name) === undefined,
    );
    expect(unresolved).toEqual([]);
  });
});
