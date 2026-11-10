// The states of a node that Reanimated serves, each as the key its value is written under

type IStateName =
  'hover' | 'focus' | 'focus-within' | 'active' | 'active-deepest';

const STATE_NAMES = [
  'hover',
  'focus',
  'focus-within',
  'active',
  'active-deepest',
] as const satisfies readonly IStateName[];

export function stateKeyOf(name: string): string | null {
  return STATE_NAMES.some(state => state === name) ? `:${name}` : null;
}
