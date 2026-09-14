import { useColorScheme, PlatformColor, DynamicColorIOS } from '@symbiote-native/react';

// PlatformColor / DynamicColorIOS resolve on the native side: 'systemBlue' / 'label'
// become iOS UIColor selectors, and the dynamic tuple flips with the system
// appearance. The opaque color objects flow through the same color seam as CSS
// strings (processColor), so no special handling reaches Fabric. Name resolution is
// device-only: a wrong name silently falls back, so this is verified on simulator.
export function PlatformColorDemo() {
  const scheme = useColorScheme();
  return (
    <view className="section-nested">
      <text className="section-label">
        {`PlatformColor · semantic + DynamicColorIOS (${scheme ?? 'unknown'})`}
      </text>
      <view className="row">
        <view
          className="color-tile"
          style={{ backgroundColor: PlatformColor('systemBlue') }}
        >
          <text className="tile-label">systemBlue</text>
        </view>
        <view
          className="color-tile-bordered"
          style={{
            backgroundColor: DynamicColorIOS({
              light: '#dbeafe',
              dark: '#13243a',
            }),
            borderColor: PlatformColor('separator'),
          }}
        >
          <text
            className="bold-label"
            style={{ color: PlatformColor('label') }}
          >
            dynamic
          </text>
        </view>
      </view>
    </view>
  );
}
