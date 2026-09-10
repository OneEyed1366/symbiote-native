import { Component, inject } from '@angular/core';
import {
  SafeAreaViewElement,
  ScrollViewElement,
  Text,
  View,
} from '@symbiote-native/angular';
import {
  CalendarsService,
  LocalesService,
} from '@symbiote-native/localization/angular';
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
  imports: [SafeAreaViewElement, ScrollViewElement, Text, View],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="localization-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Localization</text>
            <text class="hero-body">
              @symbiote-native/localization — the device's locales and
              calendars, live-updated when the user changes their
              language/region settings.
            </text>
          </view>
        </view>

        <view testID="localization-locale-card" class="capability-card">
          <text class="capability-card-title">First locale</text>
          <view class="capability-row">
            <text class="capability-label">Language tag</text>
            <text testID="localization-language-tag" class="value-text">{{
              languageTagLabel()
            }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Currency code</text>
            <text testID="localization-currency-code" class="value-text">{{
              currencyCodeLabel()
            }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Currency symbol</text>
            <text testID="localization-currency-symbol" class="value-text">{{
              currencySymbolLabel()
            }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Text direction</text>
            <text testID="localization-text-direction" class="value-text">{{
              textDirectionLabel()
            }}</text>
          </view>
        </view>

        <view testID="localization-calendar-card" class="capability-card">
          <text class="capability-card-title">First calendar</text>
          <view class="capability-row">
            <text class="capability-label">Calendar</text>
            <text testID="localization-calendar" class="value-text">{{
              calendarLabel()
            }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">24-hour clock</text>
            <text testID="localization-24-hour-clock" class="value-text">{{
              uses24HourClockLabel()
            }}</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Time zone</text>
            <text testID="localization-time-zone" class="value-text">{{
              timeZoneLabel()
            }}</text>
          </view>
        </view>
      </scroll-view>
    </safe-area-view>
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
