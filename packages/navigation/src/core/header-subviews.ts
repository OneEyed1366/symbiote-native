// Props of a `RNSScreenStackHeaderSubview` leaf, the host of a custom view in the header
// The adapter mounts its own element inside, this fold only decides the leaf's own props

import type {
  IHeaderBarButtonVisibilityPriority,
  IScreenOptions,
} from './navigator-props';
import { negateOptional } from './screen-options';
import { featureFlags } from './screens-config';

export type IHeaderSubviewKind =
  'left' | 'right' | 'center' | 'back' | 'searchBar';

export type IHeaderSubviewOptions = {
  visibilityPriority?: IHeaderBarButtonVisibilityPriority;
  hidesSharedBackground?: boolean;
};

const SUBVIEW_STYLE = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
};

// The center subview shrinks so a long title does not push the side items out
const CENTER_SUBVIEW_STYLE = { ...SUBVIEW_STYLE, flexShrink: 1 };

// Native reads the two item options for the left and right subviews only
const SUBVIEW_TRAITS: Record<
  IHeaderSubviewKind,
  { style: Record<string, unknown>; takesItemOptions: boolean }
> = {
  left: { style: SUBVIEW_STYLE, takesItemOptions: true },
  right: { style: SUBVIEW_STYLE, takesItemOptions: true },
  center: { style: CENTER_SUBVIEW_STYLE, takesItemOptions: false },
  back: { style: SUBVIEW_STYLE, takesItemOptions: false },
  searchBar: { style: SUBVIEW_STYLE, takesItemOptions: false },
};

// The app sets a background as visible, native takes it as hidden
const SIDE_OPTION_READERS: Partial<
  Record<IHeaderSubviewKind, (options: IScreenOptions) => IHeaderSubviewOptions>
> = {
  left: options => ({
    visibilityPriority: options.headerLeftVisibilityPriority,
    hidesSharedBackground: negateOptional(options.headerLeftBackgroundVisible),
  }),
  right: options => ({
    visibilityPriority: options.headerRightVisibilityPriority,
    hidesSharedBackground: negateOptional(options.headerRightBackgroundVisible),
  }),
};

export function resolveScreenHeaderSubviewProps(
  kind: IHeaderSubviewKind,
  options: IScreenOptions,
): Record<string, unknown> {
  return resolveHeaderSubviewProps(kind, SIDE_OPTION_READERS[kind]?.(options));
}

// One leaf the adapter fills, the props are shared
// `imageProps` mark a leaf core fills itself with an image, any other leaf takes the app's view
export type IHeaderSubviewHost = {
  kind: IHeaderSubviewKind;
  props: Record<string, unknown>;
  imageProps?: Record<string, unknown>;
};

// The back image is the one custom content core can describe, it holds no framework element
export type IHeaderBackImage = {
  hostProps: Record<string, unknown>;
  imageProps: Record<string, unknown>;
};

export function resolveHeaderBackImage(
  options: IScreenOptions,
): IHeaderBackImage | undefined {
  const source = options.headerBackImageSource;
  if (source === undefined) return undefined;
  return {
    hostProps: resolveHeaderSubviewProps('back'),
    imageProps: { source, resizeMode: 'center', fadeDuration: 0 },
  };
}

export function resolveHeaderSubviewHosts(
  kinds: readonly IHeaderSubviewKind[],
  options: IScreenOptions,
): IHeaderSubviewHost[] {
  return kinds.map(kind => ({
    kind,
    props: resolveScreenHeaderSubviewProps(kind, options),
  }));
}

const CUSTOM_VIEW_KINDS = [
  'left',
  'right',
  'center',
] as const satisfies readonly IHeaderSubviewKind[];

// `views` maps a kind to whatever the adapter renders there, core only asks if one is set
// The back image comes last, it is described by the route options alone
export function resolveCustomHeaderSubviews(
  views: Partial<Record<IHeaderSubviewKind, unknown>>,
  options: IScreenOptions,
): IHeaderSubviewHost[] {
  const kinds = CUSTOM_VIEW_KINDS.filter(kind => views[kind] !== undefined);
  const hosts = resolveHeaderSubviewHosts(kinds, options);
  const backImage = resolveHeaderBackImage(options);
  if (backImage === undefined) return hosts;
  return [
    ...hosts,
    {
      kind: 'back',
      props: backImage.hostProps,
      imageProps: backImage.imageProps,
    },
  ];
}

// The app's `headerLeft`, `headerRight` and `headerTitle` filed under the leaf kind that hosts them
// A kind the app left unset is absent, `TView` is whatever the adapter takes there
export function resolveCustomHeaderViews<TView>(options: {
  headerLeft?: TView;
  headerRight?: TView;
  headerTitle?: TView;
}): Partial<Record<IHeaderSubviewKind, TView>> {
  const views: Partial<Record<IHeaderSubviewKind, TView>> = {};
  if (options.headerLeft !== undefined) views.left = options.headerLeft;
  if (options.headerRight !== undefined) views.right = options.headerRight;
  if (options.headerTitle !== undefined) views.center = options.headerTitle;
  return views;
}

// How an element-building adapter (React, Vue, Solid) makes a leaf and the image inside it
export type IHeaderSubviewFactory<TElement, TContent> = {
  subview: (
    host: IHeaderSubviewHost,
    content: TContent | undefined,
  ) => TElement;
  image: (props: Record<string, unknown>) => TContent;
};

// The three app views, generic over what the adapter renders (a React node, a Vue vnode child)
export type IHeaderViewOptions<TContent> = {
  headerLeft?: () => TContent;
  headerRight?: () => TContent;
  headerTitle?: () => TContent;
};

export function resolveCustomHeaderSubviewElements<TElement, TContent>(
  options: IScreenOptions & IHeaderViewOptions<TContent>,
  factory: IHeaderSubviewFactory<TElement, TContent>,
): TElement[] {
  const views: Partial<Record<IHeaderSubviewKind, () => TContent>> = {
    left: options.headerLeft,
    right: options.headerRight,
    center: options.headerTitle,
  };
  return resolveCustomHeaderSubviews(views, options).map(host =>
    factory.subview(
      host,
      host.imageProps === undefined
        ? views[host.kind]?.()
        : factory.image(host.imageProps),
    ),
  );
}

export function resolveHeaderSubviewProps(
  kind: IHeaderSubviewKind,
  options: IHeaderSubviewOptions = {},
): Record<string, unknown> {
  const { style, takesItemOptions } = SUBVIEW_TRAITS[kind];
  const leaf = {
    type: kind,
    style,
    synchronousShadowStateUpdatesEnabled:
      featureFlags.experiment.synchronousHeaderSubviewUpdatesEnabled,
  };
  if (!takesItemOptions) return leaf;
  return {
    ...leaf,
    visibilityPriority: options.visibilityPriority,
    hidesSharedBackground: options.hidesSharedBackground,
  };
}
