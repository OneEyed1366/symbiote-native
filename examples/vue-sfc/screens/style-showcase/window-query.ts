import { onScopeDispose, shallowRef } from 'vue';
import { matchMedia } from '@symbiote-native/vue';

type IMatchState = { matches: boolean; changes: number };

// The answer of a list and a count of its own `change` events, so a flip that never arrives
// shows as a count that stays put
export function useWindowQuery(query: string) {
  const list = matchMedia(query);
  const state = shallowRef<IMatchState>({ matches: list.matches, changes: 0 });
  list.onchange = event => {
    state.value = {
      matches: event.matches,
      changes: state.value.changes + 1,
    };
  };
  onScopeDispose(() => {
    list.onchange = null;
  });
  return state;
}
