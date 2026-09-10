<!--
  @symbiote-native/localization tour stop — useLocales/useCalendars both seed synchronously from
  the native module at setup and stay live via a change listener, so the first locale/calendar
  renders with no loading state needed. Vue SFC twin of
  ../../react/screens/LocalizationScreen.tsx.
-->
<script setup lang="ts">
import { computed } from 'vue';
import {} from '@symbiote-native/vue';
import { useCalendars, useLocales } from '@symbiote-native/localization/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Localization];
const lineColor = LINE_COLOR[lineInfo.line];

const locales = useLocales();
const calendars = useCalendars();

const locale = computed(() => locales.value[0] ?? null);
const calendar = computed(() => calendars.value[0] ?? null);

const uses24hourClockText = computed(() => {
  const value = calendar.value?.uses24hourClock;
  return value === null || value === undefined
    ? 'unknown'
    : value
      ? 'true'
      : 'false';
});
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="localization-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Localization</text>
          <text class="hero-body"
            >@symbiote-native/localization — the user's preferred locales and
            calendars, live-updated on device settings changes.</text
          >
        </view>
      </view>

      <view testID="localization-locale-card" class="localization-card">
        <text class="localization-card-title">First locale</text>
        <view class="localization-row">
          <text class="localization-row-label">Language tag</text>
          <text
            testID="localization-language-tag-value"
            class="localization-value-text"
            >{{ locale?.languageTag ?? 'unknown' }}</text
          >
        </view>
        <view class="localization-row">
          <text class="localization-row-label">Currency code</text>
          <text
            testID="localization-currency-code-value"
            class="localization-value-text"
            >{{ locale?.currencyCode ?? 'unknown' }}</text
          >
        </view>
        <view class="localization-row">
          <text class="localization-row-label">Currency symbol</text>
          <text
            testID="localization-currency-symbol-value"
            class="localization-value-text"
            >{{ locale?.currencySymbol ?? 'unknown' }}</text
          >
        </view>
        <view class="localization-row">
          <text class="localization-row-label">Text direction</text>
          <text
            testID="localization-text-direction-value"
            class="localization-value-text"
            >{{ locale?.textDirection ?? 'unknown' }}</text
          >
        </view>
      </view>

      <view testID="localization-calendar-card" class="localization-card">
        <text class="localization-card-title">First calendar</text>
        <view class="localization-row">
          <text class="localization-row-label">Calendar</text>
          <text
            testID="localization-calendar-value"
            class="localization-value-text"
            >{{ calendar?.calendar ?? 'unknown' }}</text
          >
        </view>
        <view class="localization-row">
          <text class="localization-row-label">Uses 24h clock</text>
          <text
            testID="localization-24h-clock-value"
            class="localization-value-text"
            >{{ uses24hourClockText }}</text
          >
        </view>
        <view class="localization-row">
          <text class="localization-row-label">Time zone</text>
          <text
            testID="localization-time-zone-value"
            class="localization-value-text"
            >{{ calendar?.timeZone ?? 'unknown' }}</text
          >
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
