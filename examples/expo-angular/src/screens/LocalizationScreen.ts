import { Component, inject } from '@angular/core';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/angular';
import { CalendarsService, LocalesService } from '@symbiote-native/localization/angular';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * @symbiote-native/localization canary demo: the device's first reported locale and first
 * reported calendar, each driven by its own service (LocalesService/CalendarsService — two
 * separate services, matching upstream's own useLocales/useCalendars being two separate hooks).
 * Angular twin of ../../react/screens/LocalizationScreen.tsx.
 */
@Component({
  selector: 'LocalizationScreen',
  standalone: true,
  imports: [SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="localization-scroll" class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Localization</Text>
            <Text class="hero-body">
              @symbiote-native/localization — the device's locales and calendars, live-updated
              when the user changes their language/region settings.
            </Text>
          </View>
        </View>

        <View testID="localization-locale-card" class="capability-card">
          <Text class="capability-card-title">First locale</Text>
          <View class="capability-row">
            <Text class="capability-label">Language tag</Text>
            <Text testID="localization-language-tag" class="value-text">{{ languageTagLabel() }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Currency code</Text>
            <Text testID="localization-currency-code" class="value-text">{{ currencyCodeLabel() }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Currency symbol</Text>
            <Text testID="localization-currency-symbol" class="value-text">{{ currencySymbolLabel() }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Text direction</Text>
            <Text testID="localization-text-direction" class="value-text">{{ textDirectionLabel() }}</Text>
          </View>
        </View>

        <View testID="localization-calendar-card" class="capability-card">
          <Text class="capability-card-title">First calendar</Text>
          <View class="capability-row">
            <Text class="capability-label">Calendar</Text>
            <Text testID="localization-calendar" class="value-text">{{ calendarLabel() }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">24-hour clock</Text>
            <Text testID="localization-24-hour-clock" class="value-text">{{ uses24HourClockLabel() }}</Text>
          </View>
          <View class="capability-row">
            <Text class="capability-label">Time zone</Text>
            <Text testID="localization-time-zone" class="value-text">{{ timeZoneLabel() }}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class LocalizationScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Localization];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly locales = inject(LocalesService).connect();
  readonly calendars = inject(CalendarsService).connect();

  languageTagLabel(): string {
    return this.locales()[0]?.languageTag ?? 'no locale reported';
  }

  currencyCodeLabel(): string {
    return this.locales()[0]?.currencyCode ?? 'unknown';
  }

  currencySymbolLabel(): string {
    return this.locales()[0]?.currencySymbol ?? 'unknown';
  }

  textDirectionLabel(): string {
    return this.locales()[0]?.textDirection ?? 'unknown';
  }

  calendarLabel(): string {
    return this.calendars()[0]?.calendar ?? 'no calendar reported';
  }

  uses24HourClockLabel(): string {
    const calendar = this.calendars()[0];
    if (!calendar || calendar.uses24hourClock === null) return 'unknown';
    return calendar.uses24hourClock ? 'Yes' : 'No';
  }

  timeZoneLabel(): string {
    return this.calendars()[0]?.timeZone ?? 'unknown';
  }
}
