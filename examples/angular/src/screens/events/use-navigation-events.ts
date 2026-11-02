import { DestroyRef, inject } from '@angular/core';
import { injectNavigation } from '@symbiote-native/navigation/angular';
import type { INavigationHandle } from '@symbiote-native/navigation/angular';
import { navigationEventLog } from './use-event-lines';

type IEventName = Parameters<INavigationHandle['addListener']>[0];

// Every name the emitter takes, `beforeRemove` included so the screen can show it stays silent
const EVENT_NAMES = [
  'focus',
  'blur',
  'state',
  'beforeRemove',
] as const satisfies readonly IEventName[];

function hasRoutes(data: unknown): data is { routes: unknown[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'routes' in data &&
    Array.isArray(data.routes)
  );
}

function describeEvent(name: IEventName, data: unknown): string {
  return hasRoutes(data) ? `${name}: ${data.routes.length} routes` : name;
}

// Writes each navigation event of this screen's route into the shared log
export function injectNavigationEvents(): void {
  const navigation = injectNavigation();
  const unsubscribers = EVENT_NAMES.map(name =>
    navigation.addListener(name, data =>
      navigationEventLog.append(name, describeEvent(name, data)),
    ),
  );
  inject(DestroyRef).onDestroy(() => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  });
}
