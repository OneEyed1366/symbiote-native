import { For, Show, createSignal, type Accessor } from 'solid-js';
import { Platform, SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
import {
  AndroidHaptics,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from '@symbiote-native/haptics';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const IMPACT_STYLES: readonly { label: string; style: ImpactFeedbackStyle }[] = [
  { label: 'Light', style: ImpactFeedbackStyle.Light },
  { label: 'Medium', style: ImpactFeedbackStyle.Medium },
  { label: 'Heavy', style: ImpactFeedbackStyle.Heavy },
  { label: 'Rigid', style: ImpactFeedbackStyle.Rigid },
  { label: 'Soft', style: ImpactFeedbackStyle.Soft },
];

const NOTIFICATION_TYPES: readonly {
  label: string;
  type: NotificationFeedbackType;
}[] = [
  { label: 'Success', type: NotificationFeedbackType.Success },
  { label: 'Warning', type: NotificationFeedbackType.Warning },
  { label: 'Error', type: NotificationFeedbackType.Error },
];

// Every AndroidHaptics member (packages/haptics/src/core/types.ts) - performAndroidHapticsAsync
// is a no-op on iOS, so this whole card only renders under Platform.OS === 'android' below.
const ANDROID_HAPTICS: readonly { label: string; type: AndroidHaptics }[] = [
  { label: 'Confirm', type: AndroidHaptics.Confirm },
  { label: 'Reject', type: AndroidHaptics.Reject },
  { label: 'Gesture start', type: AndroidHaptics.Gesture_Start },
  { label: 'Gesture end', type: AndroidHaptics.Gesture_End },
  { label: 'Toggle on', type: AndroidHaptics.Toggle_On },
  { label: 'Toggle off', type: AndroidHaptics.Toggle_Off },
  { label: 'Clock tick', type: AndroidHaptics.Clock_Tick },
  { label: 'Context click', type: AndroidHaptics.Context_Click },
  { label: 'Drag start', type: AndroidHaptics.Drag_Start },
  { label: 'Keyboard tap', type: AndroidHaptics.Keyboard_Tap },
  { label: 'Keyboard press', type: AndroidHaptics.Keyboard_Press },
  { label: 'Keyboard release', type: AndroidHaptics.Keyboard_Release },
  { label: 'Long press', type: AndroidHaptics.Long_Press },
  { label: 'Virtual key', type: AndroidHaptics.Virtual_Key },
  { label: 'Virtual key release', type: AndroidHaptics.Virtual_Key_Release },
  { label: 'No haptics', type: AndroidHaptics.No_Haptics },
  { label: 'Segment tick', type: AndroidHaptics.Segment_Tick },
  {
    label: 'Segment frequent tick',
    type: AndroidHaptics.Segment_Frequent_Tick,
  },
  { label: 'Text handle move', type: AndroidHaptics.Text_Handle_Move },
];

/**
 * @symbiote-native/haptics canary demo: one card per API - impactAsync (five
 * ImpactFeedbackStyle values), notificationAsync (three NotificationFeedbackType values),
 * selectionAsync, and, Android-only, performAndroidHapticsAsync over every AndroidHaptics
 * value. All four calls are fire-and-forget (no result to await) - the "last fired" row exists
 * purely as visible confirmation that a tap actually reached the native module.
 */
export function HapticsScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Haptics];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [lastFired, setLastFired] = createSignal<string | null>(null);

  const handleImpact = (style: ImpactFeedbackStyle, label: string) => {
    impactAsync(style);
    setLastFired(`impactAsync(${label})`);
  };

  const handleNotification = (type: NotificationFeedbackType, label: string) => {
    notificationAsync(type);
    setLastFired(`notificationAsync(${label})`);
  };

  const handleSelection = () => {
    selectionAsync();
    setLastFired('selectionAsync()');
  };

  const handleAndroidHaptic = (type: AndroidHaptics, label: string) => {
    performAndroidHapticsAsync(type);
    setLastFired(`performAndroidHapticsAsync(${label})`);
  };

  return (
    <SafeAreaView class="screen">
      <ScrollView
        testID="haptics-scroll"
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
            <Text class="hero-title">Haptics</Text>
            <Text class="hero-body">
              @symbiote-native/haptics — impact/notification/selection vibration
              feedback via iOS's Taptic Engine and Android's Vibrator API. A
              simulator won't produce physical feedback; a real device is needed
              to feel it.
            </Text>
          </View>
        </View>

        <View testID="haptics-impact-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Impact</Text>
          </View>
          <View class="button-row">
            <For each={IMPACT_STYLES}>
              {({ label, style }) => (
                <ActionButton
                  testID={`haptics-impact-${label.toLowerCase()}`}
                  title={label}
                  onPress={() => handleImpact(style, label)}
                  color={lineColor}
                />
              )}
            </For>
          </View>
        </View>

        <View testID="haptics-notification-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Notification</Text>
          </View>
          <View class="button-row">
            <For each={NOTIFICATION_TYPES}>
              {({ label, type }) => (
                <ActionButton
                  testID={`haptics-notification-${label.toLowerCase()}`}
                  title={label}
                  onPress={() => handleNotification(type, label)}
                  color={lineColor}
                />
              )}
            </For>
          </View>
        </View>

        <View testID="haptics-selection-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Selection</Text>
          </View>
          <ActionButton
            testID="haptics-selection-button"
            title="Selection"
            onPress={handleSelection}
            color={lineColor}
          />
        </View>

        {Platform.OS === 'android' && (
          <View testID="haptics-android-card" class="feature-card">
            <View class="feature-card-header">
              <Text class="feature-card-title">Android haptics</Text>
            </View>
            <Text class="info-text">
              performAndroidHapticsAsync() drives the device haptics engine
              directly — Android only.
            </Text>
            <View class="button-row">
              <For each={ANDROID_HAPTICS}>
                {({ label, type }) => (
                  <ActionButton
                    testID={`haptics-android-${type}`}
                    title={label}
                    onPress={() => handleAndroidHaptic(type, label)}
                    color={lineColor}
                  />
                )}
              </For>
            </View>
          </View>
        )}

        <Show when={lastFired()}>
          {(fired: Accessor<string>) => (
            <View testID="haptics-last-fired" class="feature-card">
              <Text class="value-text">{`Last fired: ${fired()}`}</Text>
            </View>
          )}
        </Show>
      </ScrollView>
    </SafeAreaView>
  );
}
