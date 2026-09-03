// PlatformColor / DynamicColorIOS resolve on the NATIVE side: 'systemBlue' / 'label' become iOS
// UIColor selectors, and the dynamic tuple flips with the system appearance. The opaque colour
// objects flow through the same colour seam as CSS strings (processColor), so nothing special
// reaches Fabric. Name resolution is device-only — a wrong name falls back silently — so this is
// verified on simulator, not headless.

import {
  DynamicColorIOS,
  PlatformColor,
  Text,
  View,
  createColorScheme,
} from '@symbiote-native/solid';
import './PlatformColorDemo.css';

export function PlatformColorDemo() {
  // `createColorScheme`, not Vue's/React's `useColorScheme`: Solid reserves `use*` for consuming
  // something that already exists, and this owns a subscription (adapter naming idiom). It hands
  // back an ACCESSOR — a snapshot would freeze at the scheme the app booted with, since this body
  // never runs again.
  const scheme = createColorScheme();

  return (
    <View class="section-nested">
      <Text class="section-label">
        {`PlatformColor · semantic + DynamicColorIOS (${scheme() ?? 'unknown'})`}
      </Text>
      <View class="row">
        <View
          class="color-tile"
          style={{ backgroundColor: PlatformColor('systemBlue') }}
        >
          <Text class="color-tile-label">systemBlue</Text>
        </View>
        <View
          class="color-tile-bordered"
          style={{
            backgroundColor: DynamicColorIOS({
              light: '#dbeafe',
              dark: '#16305a',
            }),
            borderColor: PlatformColor('separator'),
          }}
        >
          <Text
            class="color-tile-label"
            style={{ color: PlatformColor('label') }}
          >
            dynamic
          </Text>
        </View>
      </View>
    </View>
  );
}
