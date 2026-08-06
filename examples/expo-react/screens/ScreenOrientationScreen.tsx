import { useCallback } from 'react';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
import {
  Orientation,
  OrientationLock,
  lockAsync,
  unlockAsync,
  useScreenOrientation,
} from '@symbiote-native/screen-orientation/react';
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

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="capability-row">
      <Text className="capability-label">{label}</Text>
      <Text className="value-text">{value}</Text>
    </View>
  );
}

/**
 * @symbiote-native/screen-orientation canary demo: useScreenOrientation() drives the live
 * orientation + lock rows, seeded with a one-shot read then kept current by the native
 * orientation-change listener. Buttons drive lockAsync/unlockAsync.
 */
export function ScreenOrientationScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.ScreenOrientation];
  const lineColor = LINE_COLOR[lineInfo.line];
  const { orientation, orientationLock } = useScreenOrientation();

  const handleLockPortrait = useCallback(() => {
    lockAsync(OrientationLock.PORTRAIT_UP);
  }, []);

  const handleLockLandscape = useCallback(() => {
    lockAsync(OrientationLock.LANDSCAPE_LEFT);
  }, []);

  const handleUnlock = useCallback(() => {
    unlockAsync();
  }, []);

  return (
    <SafeAreaView className="screen">
      <ScrollView testID="screen-orientation-scroll" className="screen" contentContainerStyle="scroll-content">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Screen Orientation</Text>
            <Text className="hero-body">
              @symbiote-native/screen-orientation — lock/unlock orientation, plus a live
              orientation + lock state hook.
            </Text>
          </View>
        </View>

        <View testID="screen-orientation-state-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Current state</Text>
          </View>
          <ValueRow label="Orientation" value={orientationLabel(orientation)} />
          <ValueRow label="Orientation lock" value={orientationLockLabel(orientationLock)} />
        </View>

        <View testID="screen-orientation-actions-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Actions</Text>
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
