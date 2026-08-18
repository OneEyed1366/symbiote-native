import { defineComponent, ref } from 'vue';
import {
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/vue';
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

const IMPACT_STYLES: readonly ImpactFeedbackStyle[] = [
  ImpactFeedbackStyle.Light,
  ImpactFeedbackStyle.Medium,
  ImpactFeedbackStyle.Heavy,
  ImpactFeedbackStyle.Rigid,
  ImpactFeedbackStyle.Soft,
];

const NOTIFICATION_TYPES: readonly NotificationFeedbackType[] = [
  NotificationFeedbackType.Success,
  NotificationFeedbackType.Warning,
  NotificationFeedbackType.Error,
];

const ANDROID_HAPTICS: readonly AndroidHaptics[] =
  Object.values(AndroidHaptics);

function impactLabel(style: ImpactFeedbackStyle): string {
  switch (style) {
    case ImpactFeedbackStyle.Light:
      return 'Light';
    case ImpactFeedbackStyle.Medium:
      return 'Medium';
    case ImpactFeedbackStyle.Heavy:
      return 'Heavy';
    case ImpactFeedbackStyle.Rigid:
      return 'Rigid';
    case ImpactFeedbackStyle.Soft:
      return 'Soft';
    default:
      return style;
  }
}

function notificationLabel(type: NotificationFeedbackType): string {
  switch (type) {
    case NotificationFeedbackType.Success:
      return 'Success';
    case NotificationFeedbackType.Warning:
      return 'Warning';
    case NotificationFeedbackType.Error:
      return 'Error';
    default:
      return type;
  }
}

// AndroidHaptics values are already hyphenated words ('gesture-start') — split + title-case
// each word rather than hand-writing a label per member (17 of them).
function androidHapticsLabel(value: AndroidHaptics): string {
  return value
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Haptics demo: @symbiote-native/haptics — every impact/notification/selection style fires
 * fire-and-forget on tap, plus the Android-only performAndroidHapticsAsync surface over
 * AndroidHaptics. No capability check exists upstream (unlike local-auth/battery) — a haptics
 * call is either a no-op or genuinely felt, so the only feedback this screen renders is which
 * call fired last. A physical device is needed to feel it; the Simulator has no haptics hardware.
 */
export const HapticsScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Haptics];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.Haptics].line];

    const lastFired = ref<string | null>(null);

    function handleImpact(style: ImpactFeedbackStyle) {
      lastFired.value = `Impact — ${impactLabel(style)}`;
      impactAsync(style);
    }

    function handleNotification(type: NotificationFeedbackType) {
      lastFired.value = `Notification — ${notificationLabel(type)}`;
      notificationAsync(type);
    }

    function handleSelection() {
      lastFired.value = 'Selection';
      selectionAsync();
    }

    function handleAndroidHaptics(type: AndroidHaptics) {
      lastFired.value = `Android — ${androidHapticsLabel(type)}`;
      performAndroidHapticsAsync(type);
    }

    return () => (
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
                @symbiote-native/haptics — impact, notification, and selection
                feedback via iOS's Taptic Engine and Android's Vibrator API.
                Every button fires immediately; a physical device is needed to
                feel it, the Simulator has no haptics hardware.
              </Text>
            </View>
          </View>

          <View testID="haptics-impact-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Impact</Text>
            </View>
            {IMPACT_STYLES.map(style => (
              <ActionButton
                key={style}
                testID={`haptics-impact-${style}`}
                title={impactLabel(style)}
                onPress={() => handleImpact(style)}
                color={lineColor}
              />
            ))}
          </View>

          <View testID="haptics-notification-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Notification</Text>
            </View>
            {NOTIFICATION_TYPES.map(type => (
              <ActionButton
                key={type}
                testID={`haptics-notification-${type}`}
                title={notificationLabel(type)}
                onPress={() => handleNotification(type)}
                color={lineColor}
              />
            ))}
          </View>

          <View testID="haptics-selection-card" class="auth-card">
            <View class="auth-card-header">
              <Text class="auth-card-title">Selection</Text>
            </View>
            <ActionButton
              testID="haptics-selection-button"
              title="Selection"
              onPress={handleSelection}
              color={lineColor}
            />
          </View>

          {Platform.OS === 'android' && (
            <View testID="haptics-android-card" class="auth-card">
              <View class="auth-card-header">
                <Text class="auth-card-title">Android haptics engine</Text>
              </View>
              {ANDROID_HAPTICS.map(type => (
                <ActionButton
                  key={type}
                  testID={`haptics-android-${type}`}
                  title={androidHapticsLabel(type)}
                  onPress={() => handleAndroidHaptics(type)}
                  color={lineColor}
                />
              ))}
            </View>
          )}

          {lastFired.value && (
            <View testID="haptics-last-fired" class="auth-card">
              <Text class="auth-value-text">{`Last fired: ${lastFired.value}`}</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'HapticsScreen' },
);
