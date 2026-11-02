import type { IDrawerOptions } from '@symbiote-native/navigation';

const DEFAULT = 'default';

export const DRAWER_TYPES = ['front', 'back', 'slide', 'permanent'] as const;
export const DRAWER_POSITIONS = ['left', 'right'] as const;
export const WIDTH_CHOICES = ['narrow', DEFAULT, 'wide'] as const;
export const OVERLAY_CHOICES = [DEFAULT, 'clear', 'tint'] as const;
export const EDGE_CHOICES = ['32', '80', '160'] as const;
export const DISTANCE_CHOICES = ['20', '60', '120'] as const;
export const VELOCITY_CHOICES = ['0.1', '0.5', '2'] as const;

type IWidthChoice = (typeof WIDTH_CHOICES)[number];
type IOverlayChoice = (typeof OVERLAY_CHOICES)[number];

export type IDrawerSettings = {
  drawerType: (typeof DRAWER_TYPES)[number];
  drawerPosition: (typeof DRAWER_POSITIONS)[number];
  width: IWidthChoice;
  overlay: IOverlayChoice;
  isSwipeEnabled: boolean;
  edge: (typeof EDGE_CHOICES)[number];
  distance: (typeof DISTANCE_CHOICES)[number];
  velocity: (typeof VELOCITY_CHOICES)[number];
};

export const DEFAULT_DRAWER_SETTINGS: IDrawerSettings = {
  drawerType: 'front',
  drawerPosition: 'left',
  width: DEFAULT,
  overlay: DEFAULT,
  isSwipeEnabled: true,
  edge: '32',
  distance: '60',
  velocity: '0.5',
};

// The library default is 280, so default stays undefined and the two others sit around it
export const DRAWER_WIDTH: Record<Exclude<IWidthChoice, 'default'>, number> = {
  narrow: 200,
  wide: 340,
};

const OVERLAY_COLOR: Record<Exclude<IOverlayChoice, 'default'>, string> = {
  clear: 'transparent',
  tint: 'rgba(94, 200, 242, 0.35)',
};

function widthOf(choice: IWidthChoice): number | undefined {
  return choice === DEFAULT ? undefined : DRAWER_WIDTH[choice];
}

function overlayOf(choice: IOverlayChoice): string | undefined {
  return choice === DEFAULT ? undefined : OVERLAY_COLOR[choice];
}

// The Drawer takes these as navigator props, not as options of a screen
export function drawerPropsOf(settings: IDrawerSettings): IDrawerOptions {
  return {
    drawerType: settings.drawerType,
    drawerPosition: settings.drawerPosition,
    drawerWidth: widthOf(settings.width),
    overlayColor: overlayOf(settings.overlay),
    swipeEnabled: settings.isSwipeEnabled,
    swipeEdgeWidth: Number(settings.edge),
    swipeMinDistance: Number(settings.distance),
    swipeMinVelocity: Number(settings.velocity),
  };
}
