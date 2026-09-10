import { defineComponent } from 'vue';
import { ScrollView } from '@symbiote-native/vue';
import { useCalendars, useLocales } from '@symbiote-native/localization/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
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
        <safe-area-view class="screen">
          <ScrollView
            testID="localization-scroll"
            class="screen"
            contentContainerStyle="scroll-content"
          >
            <view class={`line-tag line-tag-${lineInfo.line}`}>
              <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
            </view>
            <view class="hero-card">
              <view class="hero-badge" style={{ backgroundColor: lineColor }}>
                <text class="hero-badge-text">{lineInfo.code}</text>
              </view>
              <view class="hero-copy">
                <text class="hero-title">Localization</text>
                <text class="hero-body">
                  @symbiote-native/localization — the user's preferred locales
                  and calendars, live-updated on device settings changes.
                </text>
              </view>
            </view>

            <view testID="localization-locale-card" class="auth-card">
              <view class="auth-card-header">
                <text class="auth-card-title">First locale</text>
              </view>
              <ValueRow
                label="Language tag"
                value={locale?.languageTag ?? 'unknown'}
              />
              <ValueRow
                label="Currency code"
                value={locale?.currencyCode ?? 'unknown'}
              />
              <ValueRow
                label="Currency symbol"
                value={locale?.currencySymbol ?? 'unknown'}
              />
              <ValueRow
                label="Text direction"
                value={locale?.textDirection ?? 'unknown'}
              />
            </view>

            <view testID="localization-calendar-card" class="auth-card">
              <view class="auth-card-header">
                <text class="auth-card-title">First calendar</text>
              </view>
              <ValueRow
                label="Calendar"
                value={calendar?.calendar ?? 'unknown'}
              />
              <ValueRow
                label="Uses 24h clock"
                value={
                  calendar?.uses24hourClock === null ||
                  calendar?.uses24hourClock === undefined
                    ? 'unknown'
                    : calendar.uses24hourClock
                      ? 'true'
                      : 'false'
                }
              />
              <ValueRow
                label="Time zone"
                value={calendar?.timeZone ?? 'unknown'}
              />
            </view>
          </ScrollView>
        </safe-area-view>
      );
    };
  },
  { name: 'LocalizationScreen' },
);
