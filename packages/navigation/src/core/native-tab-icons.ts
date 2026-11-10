// Tab icons of the native tabs: the app writes one icon object, native reads flat keys per platform
// The key sets differ, iOS names a symbol or an image kind and Android names a drawable or an image

import { imageStatics } from '@symbiote-native/components';
import type { IImageSourceProp } from '@symbiote-native/components';

export type ITabIconImageRenderingMode = 'default' | 'template' | 'original';
export type ITabIconSymbolRenderingMode = 'default' | 'monochrome' | 'original';
export type ITabIconTinting = 'default' | 'tinted' | 'original';

// Both platforms accept an image source, the constant keeps their two switches in step
const IMAGE_SOURCE_ICON = 'imageSource';

export type ITabIconIOS =
  | {
      type: 'sfSymbol';
      name: string;
      renderingMode?: ITabIconSymbolRenderingMode;
    }
  | { type: 'xcasset'; name: string }
  | { type: 'templateSource'; templateSource: IImageSourceProp }
  | {
      type: typeof IMAGE_SOURCE_ICON;
      imageSource: IImageSourceProp;
      renderingMode?: ITabIconImageRenderingMode;
    };

export type ITabIconAndroid =
  | { type: 'drawableResource'; name: string; tinting?: ITabIconTinting }
  | {
      type: typeof IMAGE_SOURCE_ICON;
      imageSource: IImageSourceProp;
      tinting?: ITabIconTinting;
    };

type IIconProps = Record<string, unknown>;

function parseIconIOS(icon: ITabIconIOS | undefined): IIconProps {
  if (!icon) return {};
  switch (icon.type) {
    case 'sfSymbol':
      return {
        iconType: 'sfSymbol',
        iconSymbolRenderingMode: icon.renderingMode,
        iconResourceName: icon.name,
      };
    case 'xcasset':
      return { iconType: 'xcasset', iconResourceName: icon.name };
    case 'templateSource':
      return {
        iconType: 'image',
        iconImageRenderingMode: 'template',
        iconImageSource: icon.templateSource,
      };
    case IMAGE_SOURCE_ICON:
      return {
        iconType: 'image',
        iconImageRenderingMode: icon.renderingMode,
        iconImageSource: icon.imageSource,
      };
  }
}

// The selected icon reuses the icon keys, native tells the two apart by the `selected` prefix
function selectedKeys(parsed: IIconProps): IIconProps {
  return {
    selectedIconImageRenderingMode: parsed.iconImageRenderingMode,
    selectedIconSymbolRenderingMode: parsed.iconSymbolRenderingMode,
    selectedIconImageSource: parsed.iconImageSource,
    selectedIconResourceName: parsed.iconResourceName,
  };
}

// A selected icon of another kind would leave native with two incompatible icon types
export function resolveTabIconsIOS(
  icon: ITabIconIOS | undefined,
  selectedIcon: ITabIconIOS | undefined,
): IIconProps {
  const parsedIcon = parseIconIOS(icon);
  const parsedSelected = parseIconIOS(selectedIcon);
  if (
    parsedIcon.iconType === undefined &&
    parsedSelected.iconType !== undefined
  ) {
    throw new Error(
      '[RNScreens] To use selectedIcon prop, the icon prop must also be provided.',
    );
  }
  if (
    parsedSelected.iconType !== undefined &&
    parsedIcon.iconType !== parsedSelected.iconType
  ) {
    throw new Error('[RNScreens] icon and selectedIcon must be same type.');
  }
  if (icon === undefined) return {};
  return { ...parsedIcon, ...selectedKeys(parsedSelected) };
}

function parseIconAndroid(icon: ITabIconAndroid | undefined): IIconProps {
  if (!icon) return {};
  switch (icon.type) {
    case 'drawableResource':
      return { drawableIconResourceName: icon.name };
    case IMAGE_SOURCE_ICON: {
      const imageIconResource = imageStatics.resolveAssetSource(
        icon.imageSource,
      );
      // Native expects a map, so an unresolved asset is dropped rather than passed as a number
      if (!imageIconResource) {
        console.error('[RNScreens] Failed to resolve an asset.');
      }
      return { imageIconResource: imageIconResource || undefined };
    }
  }
}

export function resolveTabIconsAndroid(
  icon: ITabIconAndroid | undefined,
  selectedIcon: ITabIconAndroid | undefined,
): IIconProps {
  const parsedIcon = parseIconAndroid(icon);
  const parsedSelected = parseIconAndroid(selectedIcon);
  return {
    ...parsedIcon,
    iconTinting: icon?.tinting,
    selectedImageIconResource: parsedSelected.imageIconResource,
    selectedDrawableIconResourceName: parsedSelected.drawableIconResourceName,
    selectedIconTinting: selectedIcon?.tinting,
  };
}
