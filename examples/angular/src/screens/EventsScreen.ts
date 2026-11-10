import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/angular';
import { ActionButton } from '../components/ActionButton';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { EventRecipes } from './events/EventRecipes';
import { injectEventLines, navigationEventLog } from './events/use-event-lines';
import { injectNavigationEvents } from './events/use-navigation-events';

// Screen events come through the options, the progress ticks fold into one line of the log
export const eventsScreenOptions: IScreenOptionsResolver = () => ({
  title: 'Events',
  headerShown: true,
  headerTintColor: LINE_COLOR.introspection,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  onTransitionProgress: payload =>
    navigationEventLog.append(
      'progress',
      `progress ${payload.progress.toFixed(2)} ${payload.closing === 1 ? 'closing' : 'opening'}`,
      { isTick: true },
    ),
  onHeaderAttached: () =>
    navigationEventLog.append('header', 'header attached'),
  onHeaderDetached: () =>
    navigationEventLog.append('header', 'header detached'),
});

@Component({
  selector: 'EventsScreen',
  standalone: true,
  imports: [ActionButton, EventRecipes, ScreenHero, SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view
      testID="events-scroll"
      class="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view class="scroll-content">
        <ScreenHero
          [route]="route"
          title="Events"
          body="What this route hears while you navigate. The log stays when you leave, so come back to read the way out."
        ></ScreenHero>
        <view testID="events-log" class="recipe">
          <text class="recipe-question">Live log</text>
          @if (lines().length > 0) {
            @for (line of lines(); track $index) {
              <text
                [testID]="'events-log-line-' + $index"
                class="list-row-text"
                >{{
                  line.count > 1 ? line.text + ' x' + line.count : line.text
                }}</text
              >
            }
          } @else {
            <text class="info-text">Nothing yet, press a button below</text>
          }
          <ActionButton
            testID="events-clear"
            title="Clear log"
            (press)="clear()"
            [color]="color"
          ></ActionButton>
        </view>
        <EventRecipes></EventRecipes>
      </view>
    </scroll-view>
  `,
})
export class EventsScreen {
  readonly route = ROUTE_NAME.Events;
  readonly color = LINE_COLOR.introspection;
  readonly lines = injectEventLines();

  constructor() {
    injectNavigationEvents();
  }

  clear(): void {
    navigationEventLog.clear();
  }
}
