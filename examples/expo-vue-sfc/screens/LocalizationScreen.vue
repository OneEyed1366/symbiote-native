<!--
  @symbiote-native/localization tour stop — useLocales/useCalendars both seed synchronously from
  the native module at setup and stay live via a change listener, so the first locale/calendar
  renders with no loading state needed. Vue SFC twin of
  ../../react/screens/LocalizationScreen.tsx.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
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
  return value === null || value === undefined ? 'unknown' : value ? 'true' : 'false';
});
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView testID="localization-scroll" class="screen" content-container-style="scroll-content">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: lineColor }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Localization</Text>
          <Text class="hero-body"
            >@symbiote-native/localization — the user's preferred locales and calendars,
            live-updated on device settings changes.</Text
          >
        </View>
      </View>

      <View testID="localization-locale-card" class="localization-card">
        <Text class="localization-card-title">First locale</Text>
        <View class="localization-row">
          <Text class="localization-row-label">Language tag</Text>
          <Text testID="localization-language-tag-value" class="localization-value-text">{{
            locale?.languageTag ?? 'unknown'
          }}</Text>
        </View>
        <View class="localization-row">
          <Text class="localization-row-label">Currency code</Text>
          <Text testID="localization-currency-code-value" class="localization-value-text">{{
            locale?.currencyCode ?? 'unknown'
          }}</Text>
        </View>
        <View class="localization-row">
          <Text class="localization-row-label">Currency symbol</Text>
          <Text testID="localization-currency-symbol-value" class="localization-value-text">{{
            locale?.currencySymbol ?? 'unknown'
          }}</Text>
        </View>
        <View class="localization-row">
          <Text class="localization-row-label">Text direction</Text>
          <Text testID="localization-text-direction-value" class="localization-value-text">{{
            locale?.textDirection ?? 'unknown'
          }}</Text>
        </View>
      </View>

      <View testID="localization-calendar-card" class="localization-card">
        <Text class="localization-card-title">First calendar</Text>
        <View class="localization-row">
          <Text class="localization-row-label">Calendar</Text>
          <Text testID="localization-calendar-value" class="localization-value-text">{{
            calendar?.calendar ?? 'unknown'
          }}</Text>
        </View>
        <View class="localization-row">
          <Text class="localization-row-label">Uses 24h clock</Text>
          <Text testID="localization-24h-clock-value" class="localization-value-text">{{
            uses24hourClockText
          }}</Text>
        </View>
        <View class="localization-row">
          <Text class="localization-row-label">Time zone</Text>
          <Text testID="localization-time-zone-value" class="localization-value-text">{{
            calendar?.timeZone ?? 'unknown'
          }}</Text>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
