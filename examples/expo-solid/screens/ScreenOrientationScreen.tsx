import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
import {
  Orientation,
  OrientationLock,
  lockAsync,
  unlockAsync,
} from '@symbiote-native/screen-orientation';
import { createScreenOrientation } from '@symbiote-native/screen-orientation/solid';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function orientationLabel(orientation: Orientation): string {
  switch (orientation) {
    case Orientation.PORTRAIT_UP:
      return 'Portrait up';
    case Orientation.PORTRAIT_DOWN:
      return 'Portrait down';
    case Orientation.LANDSCAPE_LEFT:
      return 'Landscape left';
    case Orientation.LANDSCAPE_RIGHT:
      return 'Landscape right';
    case Orientation.UNKNOWN:
    default:
      return 'Unknown';
  }
}

function orientationLockLabel(orientationLock: OrientationLock): string {
  return OrientationLock[orientationLock] ?? 'Unknown';
}

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="capability-row">
      <Text class="capability-label">{props.label}</Text>
      <Text class="value-text">{props.value}</Text>
    </View>
  );
}

/**
 * @symbiote-native/screen-orientation canary demo: createScreenOrientation() drives the live
 * orientation + lock rows, seeded with a one-shot read then kept current by the native
 * orientation-change listener. Buttons drive lockAsync/unlockAsync.
 */
export function ScreenOrientationScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ScreenOrientation];
  const lineColor = LINE_COLOR[lineInfo.line];
  const screenOrientation = createScreenOrientation();

  const handleLockPortrait = () => {
    lockAsync(OrientationLock.PORTRAIT_UP);
  };

  const handleLockLandscape = () => {
    lockAsync(OrientationLock.LANDSCAPE_LEFT);
  };

  const handleUnlock = () => {
    unlockAsync();
  };

  return (
    <SafeAreaView class="screen">
      <ScrollView
        testID="screen-orientation-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text class="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Screen Orientation</Text>
            <Text class="hero-body">
              @symbiote-native/screen-orientation — lock/unlock orientation,
              plus a live orientation + lock state primitive.
            </Text>
          </View>
        </View>

        <View testID="screen-orientation-state-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Current state</Text>
          </View>
          <ValueRow
            label="Orientation"
            value={orientationLabel(screenOrientation().orientation)}
          />
          <ValueRow
            label="Orientation lock"
            value={orientationLockLabel(screenOrientation().orientationLock)}
          />
        </View>

        <View testID="screen-orientation-actions-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Actions</Text>
          </View>
          <ActionButton
            testID="screen-orientation-lock-portrait-button"
            title="Lock portrait"
            onPress={handleLockPortrait}
            color={lineColor}
          />
          <ActionButton
            testID="screen-orientation-lock-landscape-button"
            title="Lock landscape"
            onPress={handleLockLandscape}
            color={lineColor}
          />
          <ActionButton
            testID="screen-orientation-unlock-button"
            title="Unlock"
            onPress={handleUnlock}
            color={lineColor}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
