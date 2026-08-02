import { defineComponent } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import { useCalendars, useLocales } from '@symbiote-native/localization/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="auth-capability-row">
      <Text class="auth-capability-label">{props.label}</Text>
      <Text class="auth-value-text">{props.value}</Text>
    </View>
  );
}

/**
 * Localization demo: @symbiote-native/localization/vue's useLocales/useCalendars composables —
 * both seed synchronously from the native module at setup and stay live via a change listener,
 * so the first locale/calendar is shown with no loading state needed.
 */
export const LocalizationScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Localization];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.Localization].line];

    const locales = useLocales();
    const calendars = useCalendars();

    return () => {
      const locale = locales.value[0] ?? null;
      const calendar = calendars.value[0] ?? null;

      return (
        <SafeAreaView class="screen">
          <ScrollView testID="localization-scroll" class="screen" contentContainerStyle="scroll-content">
            <View class={`line-tag line-tag-${lineInfo.line}`}>
              <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
            </View>
            <View class="hero-card">
              <View class="hero-badge" style={{ backgroundColor: lineColor }}>
                <Text class="hero-badge-text">{lineInfo.code}</Text>
              </View>
              <View class="hero-copy">
                <Text class="hero-title">Localization</Text>
                <Text class="hero-body">
                  @symbiote-native/localization — the user's preferred locales and calendars,
                  live-updated on device settings changes.
                </Text>
              </View>
            </View>

            <View testID="localization-locale-card" class="auth-card">
              <View class="auth-card-header">
                <Text class="auth-card-title">First locale</Text>
              </View>
              <ValueRow label="Language tag" value={locale?.languageTag ?? 'unknown'} />
              <ValueRow label="Currency code" value={locale?.currencyCode ?? 'unknown'} />
              <ValueRow label="Currency symbol" value={locale?.currencySymbol ?? 'unknown'} />
              <ValueRow label="Text direction" value={locale?.textDirection ?? 'unknown'} />
            </View>

            <View testID="localization-calendar-card" class="auth-card">
              <View class="auth-card-header">
                <Text class="auth-card-title">First calendar</Text>
              </View>
              <ValueRow label="Calendar" value={calendar?.calendar ?? 'unknown'} />
              <ValueRow
                label="Uses 24h clock"
                value={calendar?.uses24hourClock === null || calendar?.uses24hourClock === undefined
                  ? 'unknown'
                  : calendar.uses24hourClock
                    ? 'true'
                    : 'false'}
              />
              <ValueRow label="Time zone" value={calendar?.timeZone ?? 'unknown'} />
            </View>
          </ScrollView>
        </SafeAreaView>
      );
    };
  },
  { name: 'LocalizationScreen' },
);
