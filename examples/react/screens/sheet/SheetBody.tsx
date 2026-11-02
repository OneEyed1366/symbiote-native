import { useRoute } from '@symbiote-native/navigation/react';
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
export function SheetBody() {
  const { params } = useRoute();
  const { settings, navigation } = useRouteSettings(readSheetSettings);
  const lines = useSheetLines();
  return (
    <view className="scroll-content">
      <text className="recipe-question">Sheet</text>
      <text testID="sheet-summary" className="info-text">{summaryOf(params)}</text>
      <text testID="sheet-last-event" className="list-row-text">
        {lines.length === 0 ? 'No detent event yet' : lines[lines.length - 1].text}
      </text>
      <ActionButton
        testID="sheet-dismiss"
        title="Dismiss"
        onPress={() => navigation.pop()}
        color={COLOR}
      />
      <ActionButton
        testID="sheet-present-another"
        title="Present another sheet"
        onPress={() => navigation.push(ROUTE_NAME.SheetDemo, sheetParamsOf(settings))}
        color={COLOR}
      />
      {FILLER_ROWS.map(row => (
        <view key={row} className="scroll-demo-row">
          <text className="list-row-text">{`Scroll row ${row}`}</text>
        </view>
      ))}
    </view>
  );
}
