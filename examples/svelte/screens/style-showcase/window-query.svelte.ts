import { matchMedia } from '@symbiote-native/svelte';

// The answer of a list and a count of its own `change` events, so a flip that never arrives
// shows as a count that stays put
export function useWindowQuery(query: string) {
  const list = matchMedia(query);
  let matches = $state(list.matches);
  let changes = $state(0);
  list.onchange = event => {
    matches = event.matches;
    changes += 1;
  };
  $effect(() => () => {
    list.onchange = null;
  });
  return {
    get matches() {
      return matches;
    },
    get changes() {
      return changes;
    },
  };
}
