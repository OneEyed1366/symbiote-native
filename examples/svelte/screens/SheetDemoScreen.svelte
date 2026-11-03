<script lang="ts" module>
  import type { IScreenOptionsResolver } from '@symbiote-native/navigation/svelte';
  import { LINE_COLOR } from '../navigation-lines';
  import { readSheetSettings, sheetOptionsOf } from './sheet/sheet-settings';
  import { sheetLog } from './sheet/use-sheet-log';

  // The panel is a plain screen, a sheet is the same route pushed again with the panel as params
  // The header stays opaque, a `formSheet` has its own header height accounting
  export const sheetDemoScreenOptions: IScreenOptionsResolver = ({ route }) => {
    const settings = readSheetSettings(route.params);
    return {
      title: settings.isSheet ? 'Sheet' : 'Sheet presentation',
      headerShown: true,
      headerTintColor: LINE_COLOR.presentation,
      headerTitleColor: '#ffffff',
      headerStyle: { backgroundColor: '#0b1622' },
      headerUserInterfaceStyle: 'dark',
      ...sheetOptionsOf(settings),
      sheetFooter: settings.isSheet && settings.hasFooter ? footer : undefined,
      onSheetDetentChanged: ({ index, isStable }) =>
        sheetLog.append(
          'detent',
          `detent ${index}, ${isStable ? 'stable' : 'moving'}`,
          { isTick: !isStable },
        ),
    };
  };
</script>

<script lang="ts">
  import { useRoute } from '@symbiote-native/navigation/svelte';
  import ScreenHero from '../components/ScreenHero.svelte';
  import { ROUTE_NAME } from '../routes';
  import SheetBody from './sheet/SheetBody.svelte';
  import SheetPanel from './sheet/SheetPanel.svelte';

  const route = useRoute();
  const isSheet = $derived(readSheetSettings(route.current.params).isSheet);
</script>

{#snippet footer()}
  <view testID="sheet-footer-bar" class="sheet-footer">
    <text class="sheet-footer-text">Sheet footer</text>
  </view>
{/snippet}

<!-- The scroll view is the first child, no `SafeAreaView` above it, so a taller detent fills it -->
<scroll-view testID="sheet-scroll" class="screen">
  {#if isSheet}
    <SheetBody />
  {:else}
    <view class="scroll-content">
      <ScreenHero
        route={ROUTE_NAME.SheetDemo}
        title="Sheet presentation"
        body="Pick how the sheet looks and behaves, then present it. A sheet is this route pushed again."
      />
      <SheetPanel />
    </view>
  {/if}
</scroll-view>
