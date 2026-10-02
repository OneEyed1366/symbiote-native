<script lang="ts">
  import {
    useCalendars,
    useLocales,
  } from '@symbiote-native/localization/svelte';
  import Scenario from '../components/Scenario.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const UNKNOWN_TEXT = 'unknown';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Localization];
  const lineColor = LINE_COLOR[lineInfo.line];

  // Both runes hand back a boxed getter, `.current` is what the `$derived` values subscribe to
  const locales = useLocales();
  const calendars = useCalendars();

  const locale = $derived(locales.current[0] ?? null);
  const calendar = $derived(calendars.current[0] ?? null);

  const uses24hourClockText = $derived.by(() => {
    const value = calendar?.uses24hourClock;
    if (value === null || value === undefined) {
      return UNKNOWN_TEXT;
    }
    return value ? 'Yes' : 'No';
  });
</script>

{#snippet valueRow(label: string, value: string)}
  <view class="capability-row">
    <text class="capability-label">{label}</text>
    <text class="value-text">{value}</text>
  </view>
{/snippet}

<safe-area-view class="screen">
  <scroll-view
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
          Speak the user's language and format: preferred locales, currency,
          text direction, calendar, 12 or 24 hour clock and time zone, updating
          as soon as the device settings change.
        </text>
      </view>
    </view>

    <Scenario
      testID="localization-scenario"
      title="Format prices, dates and layout for the user's region"
      why="Show the right currency, switch to right-to-left layout for Arabic or Hebrew and respect 24-hour clocks, without asking users to configure anything."
      steps={[
        'Read the locale and calendar cards',
        'Open system settings and change the language or region',
        'Come back to the app',
      ]}
      expect="Language tag, currency, text direction and clock format update to the new settings without restarting the app."
    />

    <view testID="localization-locale-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Locale</text>
      </view>
      {@render valueRow('Language tag', locale?.languageTag ?? UNKNOWN_TEXT)}
      {@render valueRow('Currency code', locale?.currencyCode ?? UNKNOWN_TEXT)}
      {@render valueRow(
        'Currency symbol',
        locale?.currencySymbol ?? UNKNOWN_TEXT,
      )}
      {@render valueRow('Text direction', locale?.textDirection ?? UNKNOWN_TEXT)}
    </view>

    <view testID="localization-calendar-card" class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">Calendar</text>
      </view>
      {@render valueRow('Calendar', calendar?.calendar ?? UNKNOWN_TEXT)}
      {@render valueRow('Uses 24-hour clock', uses24hourClockText)}
      {@render valueRow('Time zone', calendar?.timeZone ?? UNKNOWN_TEXT)}
    </view>
  </scroll-view>
</safe-area-view>
