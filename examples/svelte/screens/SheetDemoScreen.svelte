<script lang="ts">
  // Sheet presentation demo: this screen is PUSHED with stackPresentation: 'formSheet' (see
  // App.svelte's sheetDemoScreenOptions) and three sheetAllowedDetents (30% / 60% / full height) —
  // drag the grabber between them. "Present" is the Menu screen's push onto this route; "Dismiss"
  // below is this route's own pop, both driving the native sheet the same way a real app would
  // toggle it from a button. Deliberately skips SafeAreaView, matching the React and Vue ports —
  // see App.svelte's sheetDemoScreenOptions comment for react-native-screens' formSheet-sizing
  // rationale (the ScrollView below must be this screen's own first direct child). Svelte twin of
  // examples/vue-sfc/screens/SheetDemoScreen.vue.
  import { ScrollView, Text, View } from '@symbiote-native/svelte';
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import ActionButton from '../components/ActionButton.svelte';

  // This screen is only ever mounted under a Stack, so useStackNavigation() hands back the
  // Stack-specific handle (pop) directly — no union narrowing.
  const navigation = useStackNavigation();
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SheetDemo];
</script>

<ScrollView class="screen" contentContainerStyle="section"
  ><View class={`line-tag line-tag-${lineInfo.line}`}
    ><Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text></View
  ><View class="hero-card"
    ><View class="hero-badge" style={{ backgroundColor: LINE_COLOR.presentation }}
      ><Text class="hero-badge-text">SH</Text></View
    ><View class="hero-copy"
      ><Text class="hero-title">Sheet presentation</Text
      ><Text class="hero-body">Pushed with stackPresentation: formSheet and three detents — drag the grabber between 30%, 60%, and full height.</Text
    ></View
  ></View
  ><Text class="info-text">stackPresentation: formSheet · detents 30% / 60% / 100% · drag the grabber</Text
  ><ActionButton
    testID="sheet-dismiss"
    title="Dismiss"
    onPress={() => navigation.current.pop()}
    color={LINE_COLOR.presentation}
  /></ScrollView
>
