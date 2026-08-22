import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
import { useCalendars, useLocales } from '@symbiote-native/localization/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="capability-row">
      <Text className="capability-label">{label}</Text>
      <Text className="value-text">{value}</Text>
    </View>
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
    <SafeAreaView className="screen">
      <ScrollView
        testID="localization-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: lineColor }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Localization</Text>
            <Text className="hero-body">
              @symbiote-native/localization — locales and calendars, each
              reactive to device settings changes via its own hook.
            </Text>
          </View>
        </View>

        <View testID="localization-locale-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Locale</Text>
          </View>
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
        </View>

        <View testID="localization-calendar-card" className="feature-card">
          <View className="feature-card-header">
            <Text className="feature-card-title">Calendar</Text>
          </View>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
