import type { IScreenOptionsResolver } from '@symbiote-native/navigation/react';
import { ActionButton } from '../components/ActionButton';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { EventRecipes } from './events/EventRecipes';
import {
  navigationEventLog,
  useEventLines,
} from './events/use-event-lines';
import { useNavigationEvents } from './events/use-navigation-events';

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
  onHeaderAttached: () => navigationEventLog.append('header', 'header attached'),
  onHeaderDetached: () => navigationEventLog.append('header', 'header detached'),
});

function LiveLog() {
  const lines = useEventLines();
  return (
    <view testID="events-log" className="recipe">
      <text className="recipe-question">Live log</text>
      {lines.length === 0 ? (
        <text className="info-text">Nothing yet, press a button below</text>
      ) : (
        lines.map((line, index) => (
          <text
            key={line.id}
            testID={`events-log-line-${index}`}
            className="list-row-text"
          >
            {line.count > 1 ? `${line.text} x${line.count}` : line.text}
          </text>
        ))
      )}
      <ActionButton
        testID="events-clear"
        title="Clear log"
        onPress={navigationEventLog.clear}
        color={LINE_COLOR.introspection}
      />
    </view>
  );
}

export function EventsScreen() {
  useNavigationEvents();
  return (
    <scroll-view
      testID="events-scroll"
      className="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view className="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.Events}
          title="Events"
          body="What this route hears while you navigate. The log stays when you leave, so come back to read the way out."
        />
        <LiveLog />
        <EventRecipes />
      </view>
    </scroll-view>
  );
}
