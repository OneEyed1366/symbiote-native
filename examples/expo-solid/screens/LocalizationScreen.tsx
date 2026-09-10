import { ScrollView } from '@symbiote-native/solid';
import {
  createCalendars,
  createLocales,
} from '@symbiote-native/localization/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text class="value-text">{props.value}</text>
    </view>
  );
}

/**
 * @symbiote-native/localization canary demo: createLocales()/createCalendars() each return an
 * accessor over an array guaranteed to hold at least one element (the type's own guarantee - see
 * the package's core types), so the first entry is read directly rather than guarded for
 * emptiness.
 */
export function LocalizationScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Localization];
  const lineColor = LINE_COLOR[lineInfo.line];

  const locales = createLocales();
  const locale = () => locales()[0];
  const calendars = createCalendars();
  const calendar = () => calendars()[0];

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
              @symbiote-native/localization — locales and calendars, each
              reactive to device settings changes via its own primitive.
            </text>
          </view>
        </view>

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
      </ScrollView>
    </safe-area-view>
  );
}
