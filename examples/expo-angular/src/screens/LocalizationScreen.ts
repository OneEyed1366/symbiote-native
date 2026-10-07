import { Component, computed, inject } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  CalendarsService,
  LocalesService,
} from '@symbiote-native/localization/angular';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ValueRow } from './ValueRow';

const UNKNOWN_TEXT = 'unknown';

@Component({
  selector: 'LocalizationScreen',
  standalone: true,
  imports: [Scenario, SYMBIOTE_ELEMENTS, ValueRow],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="localization-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="'line-tag line-tag-' + lineInfo.line">
          <text class="line-tag-text"
            >{{ lineInfo.code }} · {{ lineInfo.label }}</text
          >
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="badgeStyle">
            <text class="hero-badge-text">{{ lineInfo.code }}</text>
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
          [steps]="scenarioSteps"
          expect="Language tag, currency, text direction and clock format update to the new settings without restarting the app."
        />

        <view testID="localization-locale-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Locale</text>
          </view>
          <ValueRow
            label="Language tag"
            [value]="locale()?.languageTag ?? unknownText"
          />
          <ValueRow
            label="Currency code"
            [value]="locale()?.currencyCode ?? unknownText"
          />
          <ValueRow
            label="Currency symbol"
            [value]="locale()?.currencySymbol ?? unknownText"
          />
          <ValueRow
            label="Text direction"
            [value]="locale()?.textDirection ?? unknownText"
          />
        </view>

        <view testID="localization-calendar-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Calendar</text>
          </view>
          <ValueRow
            label="Calendar"
            [value]="calendar()?.calendar ?? unknownText"
          />
          <ValueRow
            label="Uses 24-hour clock"
            [value]="uses24hourClockText()"
          />
          <ValueRow
            label="Time zone"
            [value]="calendar()?.timeZone ?? unknownText"
          />
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class LocalizationScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Localization];
  readonly badgeStyle = { backgroundColor: LINE_COLOR.localization };
  readonly unknownText = UNKNOWN_TEXT;
  readonly scenarioSteps = [
    'Read the locale and calendar cards',
    'Open system settings and change the language or region',
    'Come back to the app',
  ];

  private readonly locales = inject(LocalesService).connect();
  private readonly calendars = inject(CalendarsService).connect();

  // `at` types the empty list as `undefined`, an index read does not
  readonly locale = computed(() => this.locales().at(0) ?? null);
  readonly calendar = computed(() => this.calendars().at(0) ?? null);

  readonly uses24hourClockText = computed(() => {
    const value = this.calendar()?.uses24hourClock;
    if (value === null || value === undefined) {
      return UNKNOWN_TEXT;
    }
    return value ? 'Yes' : 'No';
  });
}
