<script lang="ts">
  // @symbiote-native/localization tour stop — useLocales/useCalendars both seed synchronously from
  // the native module at call time and stay live via a change listener, so the first
  // locale/calendar renders with no loading state needed. Svelte twin of
  // examples/expo-vue-sfc/screens/LocalizationScreen.vue.
  import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/svelte';
  import { useCalendars, useLocales } from '@symbiote-native/localization/svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  // Shown for any field the platform leaves unset, so every row still reads as a real answer
  // rather than as an empty cell.
  const UNKNOWN_TEXT = 'unknown';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Localization];
  const lineColor = LINE_COLOR[lineInfo.line];

  // Both runes hand back a boxed getter, so `.current` is what the $derived values below
  // subscribe to — Svelte's twin of unwrapping Vue's Ref via `.value`.
  const locales = useLocales();
  const calendars = useCalendars();

  const locale = $derived(locales.current[0] ?? null);
  const calendar = $derived(calendars.current[0] ?? null);

  const uses24hourClockText = $derived.by(() => {
    const value = calendar?.uses24hourClock;
    if (value === null || value === undefined) {
      return UNKNOWN_TEXT;
    }
    return value ? 'true' : 'false';
  });
</script>

<SafeAreaView class="screen"
  ><ScrollView testID="localization-scroll" class="screen" contentContainerStyle="scroll-content"
    ><View class={`line-tag line-tag-${lineInfo.line}`}
      ><Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text></View
    ><View class="hero-card"
      ><View class="hero-badge" style={{ backgroundColor: lineColor }}
        ><Text class="hero-badge-text">{lineInfo.code}</Text></View
      ><View class="hero-copy"
        ><Text class="hero-title">Localization</Text><Text class="hero-body">@symbiote-native/localization — the user's preferred locales and calendars, live-updated on device settings changes.</Text></View
      ></View
    ><View testID="localization-locale-card" class="localization-card"
      ><Text class="localization-card-title">First locale</Text><View class="localization-row"
        ><Text class="localization-row-label">Language tag</Text><Text testID="localization-language-tag-value" class="localization-value-text">{locale?.languageTag ?? UNKNOWN_TEXT}</Text></View
      ><View class="localization-row"
        ><Text class="localization-row-label">Currency code</Text><Text testID="localization-currency-code-value" class="localization-value-text">{locale?.currencyCode ?? UNKNOWN_TEXT}</Text></View
      ><View class="localization-row"
        ><Text class="localization-row-label">Currency symbol</Text><Text testID="localization-currency-symbol-value" class="localization-value-text">{locale?.currencySymbol ?? UNKNOWN_TEXT}</Text></View
      ><View class="localization-row"
        ><Text class="localization-row-label">Text direction</Text><Text testID="localization-text-direction-value" class="localization-value-text">{locale?.textDirection ?? UNKNOWN_TEXT}</Text></View
      ></View
    ><View testID="localization-calendar-card" class="localization-card"
      ><Text class="localization-card-title">First calendar</Text><View class="localization-row"
        ><Text class="localization-row-label">Calendar</Text><Text testID="localization-calendar-value" class="localization-value-text">{calendar?.calendar ?? UNKNOWN_TEXT}</Text></View
      ><View class="localization-row"
        ><Text class="localization-row-label">Uses 24h clock</Text><Text testID="localization-24h-clock-value" class="localization-value-text">{uses24hourClockText}</Text></View
      ><View class="localization-row"
        ><Text class="localization-row-label">Time zone</Text><Text testID="localization-time-zone-value" class="localization-value-text">{calendar?.timeZone ?? UNKNOWN_TEXT}</Text></View
      ></View
    ></ScrollView
  ></SafeAreaView
>
