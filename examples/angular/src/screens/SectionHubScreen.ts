import { Component, computed } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  injectRoute,
  injectStackNavigation,
} from '@symbiote-native/navigation/angular';
import type { IAngularScreenOptions } from '@symbiote-native/navigation/angular';
import { MENU_SECTIONS, sectionGroups } from '../menu-sections';
import type { IMenuItem } from '../menu-sections';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { MenuRow } from './MenuRow';

// One component serves the four hubs, the route it was pushed as picks the section
@Component({
  selector: 'SectionHubScreen',
  standalone: true,
  imports: [MenuRow, SYMBIOTE_ELEMENTS],
  template: `
    @if (section(); as hub) {
      <safe-area-view class="screen">
        <scroll-view [testID]="'hub-scroll-' + hub.key" class="screen">
          <view class="scroll-content">
            <view class="menu-hero">
              <text class="menu-eyebrow">{{ hub.title.toUpperCase() }}</text>
              <text class="menu-hero-subtitle">{{ hub.hint }}</text>
            </view>
            @for (group of groups(); track $index) {
              @if (group.line) {
                <text class="hub-group-title">{{
                  group.line.toUpperCase()
                }}</text>
              }
              @for (item of group.items; track item.route) {
                <MenuRow
                  [testID]="'menu-row-' + item.route"
                  [line]="infoOf(item).line"
                  [code]="infoOf(item).code"
                  [label]="item.label"
                  [hint]="item.hint"
                  (press)="navigation.push(item.route)"
                ></MenuRow>
              }
            }
          </view>
        </scroll-view>
      </safe-area-view>
    }
  `,
})
export class SectionHubScreen {
  readonly navigation = injectStackNavigation();
  private readonly route = injectRoute();

  readonly section = computed(() =>
    MENU_SECTIONS.find(candidate => candidate.route === this.route().name),
  );
  readonly groups = computed(() => {
    const hub = this.section();
    return hub ? sectionGroups(hub) : [];
  });

  infoOf(item: IMenuItem) {
    return ROUTE_LINE_INFO[item.route];
  }
}

// One stack registration per section, App.ts renders them beside the demo screens
export const HUB_SCREENS = MENU_SECTIONS.map(section => {
  const options: IAngularScreenOptions = {
    title: section.title,
    headerShown: true,
    headerTintColor: LINE_COLOR[section.line],
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark',
  };
  return { name: section.route, component: SectionHubScreen, options };
});
