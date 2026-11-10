import type { ISearchBarCommands } from '@symbiote-native/navigation';

// The commands go through the screen options, which the Stack resolves outside the screen
// component, and the buttons of the screen read them back, so both need the one cell
export const searchBarRef: { current: ISearchBarCommands | null } = {
  current: null,
};
