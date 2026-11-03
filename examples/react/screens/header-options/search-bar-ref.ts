import { createRef } from 'react';
import type { ISearchBarCommands } from '@symbiote-native/navigation';

// The ref goes into the screen options, which the Stack resolves outside the screen component,
// and the buttons of the screen read it back, so both need the one object
export const searchBarRef = createRef<ISearchBarCommands>();
