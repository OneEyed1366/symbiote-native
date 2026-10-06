// Типы порта `SymbolModule.types.ts` из expo-symbols, без React-типов: `fallback` объявляет адаптер
import type { SFSymbol } from 'sf-symbols-typescript';
import type {
  IAccessibilityProps,
  IAriaProps,
  IResponderProps,
} from '@symbiote-native/components';
import type {
  IColorValue,
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import type { IAndroidSymbol, IAndroidSymbolWeight } from './android';

export type ISymbolWeight =
  | 'unspecified'
  | 'ultraLight'
  | 'thin'
  | 'light'
  | 'regular'
  | 'medium'
  | 'semibold'
  | 'bold'
  | 'heavy'
  | 'black';

export type ISymbolScale =
  'default' | 'unspecified' | 'small' | 'medium' | 'large';

/** How the image is resized to fit its container */
export type IContentMode =
  | 'scaleToFill'
  | 'scaleAspectFit'
  | 'scaleAspectFill'
  | 'redraw'
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight';

/** The symbol variant, `palette` takes its colors from `colors` */
export type ISymbolType =
  'monochrome' | 'hierarchical' | 'palette' | 'multicolor';

export type IAnimationType = 'bounce' | 'pulse' | 'scale';

export type IAnimationEffect = {
  type: IAnimationType;
  /**
   * Whether the entire symbol animates or just the individual layers
   * @default false
   */
  wholeSymbol?: boolean;
  direction?: 'up' | 'down';
};

// Эффекты складываются: каждое значение `true` добавляет ещё один
export type IVariableAnimationSpec = {
  /** An effect that reverses each time it repeats */
  reversing?: boolean;
  /** An effect that does not reverse each time it repeats */
  nonReversing?: boolean;
  /** Each successive layer stays enabled until the end of the cycle, cancels `iterative` */
  cumulative?: boolean;
  /** Momentarily enables each layer of a symbol in sequence */
  iterative?: boolean;
  /** Hides inactive layers completely instead of drawing them with reduced opacity */
  hideInactiveLayers?: boolean;
  /** Draws inactive layers with reduced, but nonzero, opacity */
  dimInactiveLayers?: boolean;
};

export type IAnimationSpec = {
  effect?: IAnimationEffect;
  /** If the animation repeats */
  repeating?: boolean;
  /** The number of times the animation repeats */
  repeatCount?: number;
  /** The duration of the animation in seconds */
  speed?: number;
  variableAnimationSpec?: IVariableAnimationSpec;
};

type IViewSurface = IAccessibilityProps &
  IAriaProps &
  IResponderProps & {
    style?: IStyleProp<IViewStyle>;
    testID?: string;
    nativeID?: string;
    onLayout?: (event: ISymbioteEvent) => void;
  };

export type ISymbolName =
  SFSymbol | { ios?: SFSymbol; android?: IAndroidSymbol; web?: IAndroidSymbol };

export type ISymbolViewProps = IViewSurface & {
  /** SF Symbols names are listed in the Apple SF Symbols app */
  name: ISymbolName;
  /**
   * @default 'monochrome'
   * @platform ios
   */
  type?: ISymbolType;
  /**
   * @default 'unspecified'
   * @platform ios
   */
  scale?: ISymbolScale;
  /**
   * On Android import the weight from `androidWeights/{weight}`
   * @default 'unspecified'
   */
  weight?:
    ISymbolWeight | { ios: ISymbolWeight; android: IAndroidSymbolWeight };
  /**
   * Colors of a `palette` symbol
   * @platform ios
   */
  colors?: IColorValue | IColorValue[];
  /**
   * @default 24
   */
  size?: number;
  tintColor?: IColorValue;
  /**
   * @default 'scaleAspectFit'
   * @platform ios
   */
  resizeMode?: IContentMode;
  /** @platform ios */
  animationSpec?: IAnimationSpec;
};
