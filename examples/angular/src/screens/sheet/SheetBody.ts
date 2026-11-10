import { Component, computed } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectRoute } from '@symbiote-native/navigation/angular';
import { ActionButton } from '../../components/ActionButton';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { injectRouteSettings } from '../use-route-settings';
import { readSheetSettings, sheetParamsOf } from './sheet-settings';
import { injectSheetLines } from './use-sheet-log';

const FILLER_ROW_COUNT = 14;

// What the sheet shows of itself: its settings, the detent events and the way out
@Component({
  selector: 'SheetBody',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view class="scroll-content">
      <text class="recipe-question">Sheet</text>
      <text testID="sheet-summary" class="info-text">{{ summary() }}</text>
      <text testID="sheet-last-event" class="list-row-text">{{
        lastEvent()
      }}</text>
      <ActionButton
        testID="sheet-dismiss"
        title="Dismiss"
        (press)="navigation.pop()"
        [color]="color"
      ></ActionButton>
      <ActionButton
        testID="sheet-present-another"
        title="Present another sheet"
        (press)="presentAnother()"
        [color]="color"
      ></ActionButton>
      @for (row of rows; track row) {
        <view class="scroll-demo-row">
          <text class="list-row-text">Scroll row {{ row }}</text>
        </view>
      }
    </view>
  `,
})
export class SheetBody {
  private readonly route = injectRoute();
  private readonly routeSettings = injectRouteSettings(readSheetSettings);
  private readonly lines = injectSheetLines();

  readonly navigation = this.routeSettings.navigation;
  readonly color = LINE_COLOR.presentation;
  readonly rows = Array.from(
    { length: FILLER_ROW_COUNT },
    (_row, index) => index + 1,
  );
  readonly summary = computed(() => {
    const settings = readSheetSettings(this.route().params);
    return `detents ${settings.detents}, initial ${settings.initialDetent}, undimmed ${settings.undimmed}`;
  });
  readonly lastEvent = computed(() => {
    const all = this.lines();
    return all.length === 0 ? 'No detent event yet' : all[all.length - 1].text;
  });

  presentAnother(): void {
    this.navigation.push(
      ROUTE_NAME.SheetDemo,
      sheetParamsOf(this.routeSettings.settings()),
    );
  }
}
