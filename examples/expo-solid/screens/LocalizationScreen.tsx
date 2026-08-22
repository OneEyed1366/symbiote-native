import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
import { createCalendars, createLocales } from '@symbiote-native/localization/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <View class="capability-row">
      <Text class="capability-label">{props.label}</Text>
      <Text class="value-text">{props.value}</Text>
    </View>
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
    <SafeAreaView class="screen">
      <ScrollView
        testID="localization-scroll"
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
            <Text class="hero-title">Localization</Text>
            <Text class="hero-body">
              @symbiote-native/localization — locales and calendars, each
              reactive to device settings changes via its own primitive.
            </Text>
          </View>
        </View>

        <View testID="localization-locale-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Locale</Text>
          </View>
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
        </View>

        <View testID="localization-calendar-card" class="feature-card">
          <View class="feature-card-header">
            <Text class="feature-card-title">Calendar</Text>
          </View>
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
          <ValueRow label="Time zone" value={calendar().timeZone ?? 'unknown'} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
