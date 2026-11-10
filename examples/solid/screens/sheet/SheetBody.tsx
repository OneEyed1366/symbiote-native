import { For } from 'solid-js';
import { useRoute } from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../../routes';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';
import { useRouteSettings } from '../use-route-settings';
import { readSheetSettings, sheetParamsOf } from './sheet-settings';
import { createSheetLines } from './use-sheet-log';

const COLOR = LINE_COLOR.presentation;
const FILLER_ROWS = Array.from({ length: 14 }, (_row, index) => index + 1);

function summaryOf(params: unknown): string {
  const settings = readSheetSettings(params);
  return `detents ${settings.detents}, initial ${settings.initialDetent}, undimmed ${settings.undimmed}`;
}

// What the sheet shows of itself: its settings, the detent events and the way out
export function SheetBody() {
  const route = useRoute();
  const { settings, navigation } = useRouteSettings(readSheetSettings);
  const lines = createSheetLines();
  const lastEvent = () => {
    const all = lines();
    return all.length === 0 ? 'No detent event yet' : all[all.length - 1].text;
  };
  return (
    <view class="scroll-content">
      <text class="recipe-question">Sheet</text>
      <text testID="sheet-summary" class="info-text">{summaryOf(route().params)}</text>
      <text testID="sheet-last-event" class="list-row-text">
        {lastEvent()}
      </text>
      <ActionButton
        testID="sheet-dismiss"
        title="Dismiss"
        onPress={() => navigation().pop()}
        color={COLOR}
      />
      <ActionButton
        testID="sheet-present-another"
        title="Present another sheet"
        onPress={() =>
          navigation().push(ROUTE_NAME.SheetDemo, sheetParamsOf(settings()))
        }
        color={COLOR}
      />
      <For each={FILLER_ROWS}>
        {row => (
          <view class="scroll-demo-row">
            <text class="list-row-text">{`Scroll row ${row}`}</text>
          </view>
        )}
      </For>
    </view>
  );
}
