import {
  createCalendars,
  createLocales,
} from '@symbiote-native/localization/solid';
import { ROUTE_NAME } from '../routes';
import { Scenario } from '../components/Scenario';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

export function LocalizationScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Localization];
  const lineColor = LINE_COLOR[lineInfo.line];

  const locales = createLocales();
  const locale = () => locales()[0];
  const calendars = createCalendars();
  const calendar = () => calendars()[0];

  return (
    <safe-area-view class="screen">
      <scroll-view
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
              Speak the user's language and format: preferred locales, currency,
              text direction, calendar, 12 or 24 hour clock and time zone,
              updating as soon as the device settings change.
            </text>
          </view>
        </view>

        <Scenario
          testID="localization-scenario"
          title="Format prices, dates and layout for the user's region"
          why="Show the right currency, switch to right-to-left layout for Arabic or Hebrew and respect 24-hour clocks, without asking users to configure anything."
          steps={['Read the locale and calendar cards', 'Open system settings and change the language or region', 'Come back to the app']}
          expect="Language tag, currency, text direction and clock format update to the new settings without restarting the app."
        />

        <view testID="localization-locale-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Locale</text>
          </view>
          <ValueRow label="Language tag" value={locale().languageTag} />
          <ValueRow
            label="Currency code"
            value={locale().currencyCode ?? 'unknown'}
          />
          <ValueRow
            label="Currency symbol"
            value={locale().currencySymbol ?? 'unknown'}
          />
          <ValueRow label="Text direction" value={locale().textDirection} />
        </view>

        <view testID="localization-calendar-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Calendar</text>
          </view>
          <ValueRow label="Calendar" value={calendar().calendar ?? 'unknown'} />
          <ValueRow
            label="Uses 24-hour clock"
            value={
              calendar().uses24hourClock === null
                ? 'unknown'
                : calendar().uses24hourClock
                  ? 'Yes'
                  : 'No'
            }
          />
          <ValueRow
            label="Time zone"
            value={calendar().timeZone ?? 'unknown'}
          />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
