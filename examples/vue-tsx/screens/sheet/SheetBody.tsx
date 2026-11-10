import { defineComponent } from 'vue';
import { useRoute } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../../routes';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';
import { useRouteSettings } from '../use-route-settings';
import { readSheetSettings, sheetParamsOf } from './sheet-settings';
import { useSheetLines } from './use-sheet-log';

const COLOR = LINE_COLOR.presentation;
const FILLER_ROWS = Array.from({ length: 14 }, (_row, index) => index + 1);

function summaryOf(params: unknown): string {
  const settings = readSheetSettings(params);
  return `detents ${settings.detents}, initial ${settings.initialDetent}, undimmed ${settings.undimmed}`;
}

// What the sheet shows of itself: its settings, the detent events and the way out
export const SheetBody = defineComponent(
  () => {
    const route = useRoute();
    const { settings, navigation } = useRouteSettings(readSheetSettings);
    const lines = useSheetLines();
    return () => (
      <view class="scroll-content">
        <text class="recipe-question">Sheet</text>
        <text testID="sheet-summary" class="info-text">
          {summaryOf(route.value.params)}
        </text>
        <text testID="sheet-last-event" class="list-row-text">
          {lines.value.length === 0
            ? 'No detent event yet'
            : lines.value[lines.value.length - 1].text}
        </text>
        <ActionButton
          testID="sheet-dismiss"
          title="Dismiss"
          onPress={() => navigation.value.pop()}
          color={COLOR}
        />
        <ActionButton
          testID="sheet-present-another"
          title="Present another sheet"
          onPress={() =>
            navigation.value.push(
              ROUTE_NAME.SheetDemo,
              sheetParamsOf(settings.value),
            )
          }
          color={COLOR}
        />
        {FILLER_ROWS.map(row => (
          <view key={row} class="scroll-demo-row">
            <text class="list-row-text">{`Scroll row ${row}`}</text>
          </view>
        ))}
      </view>
    );
  },
  { name: 'SheetBody' },
);
