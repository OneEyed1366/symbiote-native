import { useNavigation } from '@symbiote-native/navigation/svelte';
import type { INavigationHandle } from '@symbiote-native/navigation/svelte';
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
export function useNavigationEvents(): void {
  const navigation = useNavigation();
  $effect(() => {
    const handle = navigation.current;
    const unsubscribers = EVENT_NAMES.map(name =>
      handle.addListener(name, data =>
        navigationEventLog.append(name, describeEvent(name, data)),
      ),
    );
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  });
}
