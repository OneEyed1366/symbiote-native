import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';
import { ROUTE_LINE_INFO } from '../navigation-lines';
import { MENU_ITEMS } from './menu-items';

const MENU_ROWS = MENU_ITEMS.map(item => ({
  ...item,
  line: ROUTE_LINE_INFO[item.route].line,
  code: ROUTE_LINE_INFO[item.route].code,
}));

@Component({
  selector: 'MenuScreen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="menu-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class="menu-hero">
          <text class="menu-eyebrow">EXPO MODULES DEMOS</text>
          <text class="menu-hero-title"
            >Expo-SDK ports on a real native stack</text
          >
          <text class="menu-hero-subtitle">
            Each row below demos a different @symbiote-native package built on
            expo-modules-core.
          </text>
        </view>
        @for (row of rows; track row.route) {
          <pressable
            [testID]="'menu-row-' + row.route"
            [class]="'menu-row menu-row-' + row.line"
            (press)="navigation.push(row.route)"
          >
            <view [class]="'menu-badge menu-badge-' + row.line">
              <text class="menu-badge-text">{{ row.code }}</text>
            </view>
            <view class="menu-row-copy">
              <text class="menu-row-label">{{ row.label }}</text>
              <text [class]="'menu-row-hint menu-row-hint-' + row.line">{{
                row.hint
              }}</text>
            </view>
          </pressable>
        }
      </scroll-view>
    </safe-area-view>
  `,
})
export class MenuScreen {
  // Only ever mounted under the root Stack, so the handle is Stack-specific
  readonly navigation = injectStackNavigation();
  readonly rows = MENU_ROWS;
}
