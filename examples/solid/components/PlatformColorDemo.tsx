// PlatformColor / DynamicColorIOS resolve on the NATIVE side: 'systemBlue' / 'label' become iOS
// UIColor selectors, and the dynamic tuple flips with the system appearance. The opaque colour
// objects flow through the same colour seam as CSS strings (processColor), so nothing special
// reaches Fabric. Name resolution is device-only — a wrong name falls back silently — so this is
// verified on simulator, not headless.

import {
  DynamicColorIOS,
  PlatformColor,
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
    <view class="section-nested">
      <text class="section-label">
        {`PlatformColor · semantic + DynamicColorIOS (${scheme() ?? 'unknown'})`}
      </text>
      <view class="row">
        <view
          class="color-tile"
          style={{ backgroundColor: PlatformColor('systemBlue') }}
        >
          <text class="color-tile-label">systemBlue</text>
        </view>
        <view
          class="color-tile-bordered"
          style={{
            backgroundColor: DynamicColorIOS({
              light: '#dbeafe',
              dark: '#16305a',
            }),
            borderColor: PlatformColor('separator'),
          }}
        >
          <text
            class="color-tile-label"
            style={{ color: PlatformColor('label') }}
          >
            dynamic
          </text>
        </view>
      </view>
    </view>
  );
}
