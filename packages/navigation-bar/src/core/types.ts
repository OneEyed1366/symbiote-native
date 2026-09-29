// Ported from expo-navigation-bar's NavigationBar.types.ts (sdk-57)

export type INavigationBarVisibility = 'visible' | 'hidden';

export type INavigationBarVisibilityEvent = {
  /** Current navigation bar visibility */
  visibility: INavigationBarVisibility;
  /** Native Android system UI visibility state, from `setOnSystemUiVisibilityChangeListener` */
  rawVisibility: number;
};

/** `auto`/`inverted` resolve against the current color scheme, `light`/`dark` are fixed */
export type INavigationBarStyle = 'auto' | 'inverted' | 'light' | 'dark';

export type INavigationBarProps = {
  /** @default 'auto' */
  style?: INavigationBarStyle;
  hidden?: boolean;
};
