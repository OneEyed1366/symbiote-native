<script lang="ts">
  import { useRoute } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { LINE_COLOR } from '../../navigation-lines';
  import { ROUTE_NAME } from '../../routes';
  import { useRouteSettings } from '../use-route-settings.svelte';
  import { readSheetSettings, sheetParamsOf } from './sheet-settings';
  import { createSheetLines } from './use-sheet-log';

  const COLOR = LINE_COLOR.presentation;
  const FILLER_ROWS = Array.from({ length: 14 }, (_row, index) => index + 1);

  // What the sheet shows of itself: its settings, the detent events and the way out
  const route = useRoute();
  const sheet = useRouteSettings(readSheetSettings);
  const lines = createSheetLines();
  const summary = $derived.by(() => {
    const settings = readSheetSettings(route.current.params);
    return `detents ${settings.detents}, initial ${settings.initialDetent}, undimmed ${settings.undimmed}`;
  });
  const lastEvent = $derived(
    lines.current.length === 0
      ? 'No detent event yet'
      : lines.current[lines.current.length - 1].text,
  );
</script>

<view class="scroll-content">
  <text class="recipe-question">Sheet</text>
  <text testID="sheet-summary" class="info-text">{summary}</text>
  <text testID="sheet-last-event" class="list-row-text">{lastEvent}</text>
  <ActionButton
    testID="sheet-dismiss"
    title="Dismiss"
    onPress={() => sheet.navigation.current.pop()}
    color={COLOR}
  />
  <ActionButton
    testID="sheet-present-another"
    title="Present another sheet"
    onPress={() =>
      sheet.navigation.current.push(
        ROUTE_NAME.SheetDemo,
        sheetParamsOf(sheet.settings),
      )}
    color={COLOR}
  />
  {#each FILLER_ROWS as row (row)}
    <view class="scroll-demo-row">
      <text class="list-row-text">{`Scroll row ${row}`}</text>
    </view>
  {/each}
</view>
