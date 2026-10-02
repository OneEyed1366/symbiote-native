<script setup lang="ts">
import { computed } from 'vue';
import { useCalendars, useLocales } from '@symbiote-native/localization/vue';
import Scenario from '../components/Scenario.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ValueRow from './ValueRow.vue';

const UNKNOWN_TEXT = 'unknown';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Localization];
const lineColor = LINE_COLOR[lineInfo.line];

const locales = useLocales();
const calendars = useCalendars();

const locale = computed(() => locales.value[0] ?? null);
const calendar = computed(() => calendars.value[0] ?? null);

const uses24hourClockText = computed(() => {
  const value = calendar.value?.uses24hourClock;
  if (value === null || value === undefined) {
    return UNKNOWN_TEXT;
  }
  return value ? 'Yes' : 'No';
});
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="localization-scroll"
      class="screen"
      contentContainerStyle="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Localization</text>
          <text class="hero-body">
            Speak the user's language and format: preferred locales, currency, text direction,
            calendar, 12 or 24 hour clock and time zone, updating as soon as the device settings
            change.
          </text>
        </view>
      </view>

      <Scenario
        testID="localization-scenario"
        title="Format prices, dates and layout for the user's region"
        why="Show the right currency, switch to right-to-left layout for Arabic or Hebrew and respect 24-hour clocks, without asking users to configure anything."
        :steps="[
          'Read the locale and calendar cards',
          'Open system settings and change the language or region',
          'Come back to the app',
        ]"
        expect="Language tag, currency, text direction and clock format update to the new settings without restarting the app."
      />

      <view testID="localization-locale-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Locale</text>
        </view>
        <ValueRow label="Language tag" :value="locale?.languageTag ?? UNKNOWN_TEXT" />
        <ValueRow label="Currency code" :value="locale?.currencyCode ?? UNKNOWN_TEXT" />
        <ValueRow label="Currency symbol" :value="locale?.currencySymbol ?? UNKNOWN_TEXT" />
        <ValueRow label="Text direction" :value="locale?.textDirection ?? UNKNOWN_TEXT" />
      </view>

      <view testID="localization-calendar-card" class="feature-card">
        <view class="feature-card-header">
          <text class="feature-card-title">Calendar</text>
        </view>
        <ValueRow label="Calendar" :value="calendar?.calendar ?? UNKNOWN_TEXT" />
        <ValueRow label="Uses 24-hour clock" :value="uses24hourClockText" />
        <ValueRow label="Time zone" :value="calendar?.timeZone ?? UNKNOWN_TEXT" />
      </view>
    </scroll-view>
  </safe-area-view>
</template>
