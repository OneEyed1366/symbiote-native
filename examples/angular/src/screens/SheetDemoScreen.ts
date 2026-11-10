import { Component, computed, viewChild } from '@angular/core';
import type { AfterViewInit, TemplateRef } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectRoute } from '@symbiote-native/navigation/angular';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/angular';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { SheetBody } from './sheet/SheetBody';
import { SheetPanel } from './sheet/SheetPanel';
import { readSheetSettings, sheetOptionsOf } from './sheet/sheet-settings';
import { sheetLog } from './sheet/use-sheet-log';

// The footer is a template and the resolver runs outside any component
// So `SheetFooterTemplate` files it here once rendered
const footerCell: { template?: TemplateRef<unknown> } = {};

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
    sheetFooter:
      settings.isSheet && settings.hasFooter ? footerCell.template : undefined,
    onSheetDetentChanged: ({ index, isStable }) =>
      sheetLog.append(
        'detent',
        `detent ${index}, ${isStable ? 'stable' : 'moving'}`,
        { isTick: !isStable },
      ),
  };
};

// Rendered once beside the stack, App lists it in `OPTION_TEMPLATE_HOSTS`
@Component({
  selector: 'SheetFooterTemplate',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <ng-template #footer>
      <view testID="sheet-footer-bar" class="sheet-footer">
        <text class="sheet-footer-text">Sheet footer</text>
      </view>
    </ng-template>
  `,
})
export class SheetFooterTemplate implements AfterViewInit {
  private readonly footer = viewChild.required<TemplateRef<unknown>>('footer');

  ngAfterViewInit(): void {
    footerCell.template = this.footer();
  }
}

// The scroll view is the first child with no `SafeAreaView` above it, so a taller detent fills it
@Component({
  selector: 'SheetDemoScreen',
  standalone: true,
  imports: [ScreenHero, SheetBody, SheetPanel, SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view testID="sheet-scroll" class="screen">
      @if (isSheet()) {
        <SheetBody></SheetBody>
      } @else {
        <view class="scroll-content">
          <ScreenHero
            [route]="screenRoute"
            title="Sheet presentation"
            body="Pick how the sheet looks and behaves, then present it. A sheet is this route pushed again."
          ></ScreenHero>
          <SheetPanel></SheetPanel>
        </view>
      }
    </scroll-view>
  `,
})
export class SheetDemoScreen {
  private readonly route = injectRoute();

  readonly screenRoute = ROUTE_NAME.SheetDemo;
  readonly isSheet = computed(
    () => readSheetSettings(this.route().params).isSheet,
  );
}
