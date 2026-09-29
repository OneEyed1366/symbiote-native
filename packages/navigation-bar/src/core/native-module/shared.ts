import type { EventSubscription } from 'expo-modules-core';
import type {
  INavigationBarVisibility,
  INavigationBarVisibilityEvent,
} from '../types';

export type INativeNavigationBarModule = {
  addListener(
    event: 'ExpoNavigationBar.didChange',
    listener: (event: INavigationBarVisibilityEvent) => void,
  ): EventSubscription;
  setStyle(style: 'light' | 'dark'): Promise<void>;
  setHidden(hidden: boolean): Promise<void>;
  getVisibilityAsync(): Promise<INavigationBarVisibility>;
};
