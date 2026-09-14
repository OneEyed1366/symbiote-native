import { useCalendars, useLocales } from '@symbiote-native/localization/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <view className="capability-row">
      <text className="capability-label">{label}</text>
      <text className="value-text">{value}</text>
    </view>
  );
}

/**
 * @symbiote-native/localization canary demo: useLocales()/useCalendars() each return an array
 * guaranteed to hold at least one element (the type's own guarantee — see the package's core
 * types), so the first entry is read directly rather than guarded for emptiness.
 */
export function LocalizationScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Localization];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [locale] = useLocales();
  const [calendar] = useCalendars();

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="localization-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Localization</text>
            <text className="hero-body">
              @symbiote-native/localization — locales and calendars, each
              reactive to device settings changes via its own hook.
            </text>
          </view>
        </view>

        <view testID="localization-locale-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Locale</text>
          </view>
          <ValueRow label="Language tag" value={locale.languageTag} />
          <ValueRow
            label="Currency code"
            value={locale.currencyCode ?? 'unknown'}
          />
          <ValueRow
            label="Currency symbol"
            value={locale.currencySymbol ?? 'unknown'}
          />
          <ValueRow label="Text direction" value={locale.textDirection} />
        </view>

        <view testID="localization-calendar-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Calendar</text>
          </view>
          <ValueRow label="Calendar" value={calendar.calendar ?? 'unknown'} />
          <ValueRow
            label="Uses 24-hour clock"
            value={
              calendar.uses24hourClock === null
                ? 'unknown'
                : calendar.uses24hourClock
                  ? 'Yes'
                  : 'No'
            }
          />
          <ValueRow label="Time zone" value={calendar.timeZone ?? 'unknown'} />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
