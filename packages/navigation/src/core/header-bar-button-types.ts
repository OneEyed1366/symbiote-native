// Option types of the header bar-button items, re-exported by `navigator-props`

import type { IColorValue } from '@symbiote-native/engine';
import type { IImageSourceProp } from '@symbiote-native/components';

// Icon of a bar-button item, the `PlatformIconIOS` union of RNS, there is no Android twin
export type IHeaderBarButtonIcon =
  | { type: 'sfSymbol'; name: string }
  | { type: 'xcasset'; name: string }
  | { type: 'imageSource'; imageSource: IImageSourceProp }
  | { type: 'templateSource'; templateSource: IImageSourceProp };

export type IHeaderBarButtonItemBadge = {
  value: string;
  style?: {
    color?: IColorValue;
    backgroundColor?: IColorValue;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
  };
};

// Which items the header gives up first when they do not fit, iOS 27 and later
export type IHeaderBarButtonVisibilityPriority = 'low' | 'standard' | 'high';

type ISharedHeaderBarButtonItem = {
  visibilityPriority?: IHeaderBarButtonVisibilityPriority;
  index?: number;
  title?: string;
  titleStyle?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    color?: IColorValue;
  };
  icon?: IHeaderBarButtonIcon;
  variant?: 'plain' | 'done' | 'prominent';
  tintColor?: IColorValue;
  disabled?: boolean;
  width?: number;
  hidesSharedBackground?: boolean;
  sharesBackground?: boolean;
  identifier?: string;
  badge?: IHeaderBarButtonItemBadge;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export type IHeaderBarButtonItemAction = ISharedHeaderBarButtonItem & {
  type: 'button';
  onPress: () => void;
  selected?: boolean;
};

export type IHeaderBarButtonMenuAction = {
  type: 'action';
  title?: string;
  subtitle?: string;
  onPress: () => void;
  icon?: IHeaderBarButtonIcon;
  state?: 'on' | 'off' | 'mixed';
  disabled?: boolean;
  destructive?: boolean;
  hidden?: boolean;
  keepsMenuPresented?: boolean;
  discoverabilityLabel?: string;
};

export type IHeaderBarButtonSubmenu = {
  type: 'submenu';
  title?: string;
  icon?: IHeaderBarButtonIcon;
  items: (IHeaderBarButtonMenuAction | IHeaderBarButtonSubmenu)[];
  displayInline?: boolean;
  destructive?: boolean;
  singleSelection?: boolean;
  displayAsPalette?: boolean;
};

export type IHeaderBarButtonItemMenu = ISharedHeaderBarButtonItem & {
  type: 'menu';
  menu: {
    title?: string;
    items: (IHeaderBarButtonMenuAction | IHeaderBarButtonSubmenu)[];
    singleSelection?: boolean;
    displayAsPalette?: boolean;
  };
  changesSelectionAsPrimaryAction?: boolean;
};

export type IHeaderBarButtonItemSpacing = { type: 'spacing'; spacing: number };

export type IHeaderBarButtonItem =
  | IHeaderBarButtonItemAction
  | IHeaderBarButtonItemMenu
  | IHeaderBarButtonItemSpacing;
