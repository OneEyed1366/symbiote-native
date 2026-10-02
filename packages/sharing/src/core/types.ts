/**
 * Where the iPad popover points. Every field is in points, relative to the presenting view;
 * omitted fields fall back to the bottom-center of that view.
 * @platform ios
 */
export type ISharingAnchor = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type ISharingOptions = {
  /**
   * MIME type of the shared file, used to pick which apps the chooser offers. Guessed from the
   * file name when omitted, falling back to a wildcard type that offers every app.
   * @platform android
   */
  mimeType?: string;
  /**
   * [Uniform Type Identifier](https://developer.apple.com/documentation/uniformtypeidentifiers)
   * of the shared file.
   *
   * Both native modules accept the field, but neither reads it in `expo-sharing@57.0.8` — it is
   * carried through for forward compatibility with upstream, not because it changes behavior.
   * @platform ios
   */
  UTI?: string;
  /**
   * Title of the share dialog. Android renders it as the chooser's header; iOS assigns it to the
   * activity controller, where most share sheets ignore it.
   */
  dialogTitle?: string;
  /**
   * Anchor rectangle for the popover iOS requires on iPad. Ignored on iPhone and on Android.
   * @platform ios
   */
  anchor?: ISharingAnchor;
};

export type IShareType = 'text' | 'url' | 'audio' | 'image' | 'video' | 'file';

export type IContentType =
  'text' | 'audio' | 'image' | 'video' | 'file' | 'website';

/** Raw data shared with the app (android, ios) */
export type ISharePayload = {
  /** Message body for `text`, the URL for `url`, otherwise typically the file URI */
  value: string;
  shareType: IShareType;
  /** MIME type of `value` */
  mimeType?: string;
};

export type IBaseResolvedSharePayload = ISharePayload & {
  /** Where the content can be read from (the redirect target for a URL), null for text */
  contentUri: string | null;
  contentType: IContentType | null;
  contentMimeType: string | null;
  /** The `suggestedFilename` HTTP header if present, otherwise the last path component */
  originalName: string | null;
  contentSize: number | null;
};

export type IUriBasedResolvedSharePayload = IBaseResolvedSharePayload & {
  contentType: 'audio' | 'file' | 'video' | 'image' | 'website';
  contentUri: string;
};

export type ITextBasedResolvedSharePayload = IBaseResolvedSharePayload & {
  contentType?: 'text';
};

/** A payload plus the details needed to display it, resolving a URL may need the network */
export type IResolvedSharePayload =
  IUriBasedResolvedSharePayload | ITextBasedResolvedSharePayload;

export type IIncomingShareSnapshot = {
  /** Unresolved payloads, available synchronously from the first read */
  sharedPayloads: ISharePayload[];
  /** Empty while resolving or when resolving failed */
  resolvedSharedPayloads: IResolvedSharePayload[];
  isResolving: boolean;
  /** The error hit while resolving, null on success */
  error: Error | null;
};

export type IUseIncomingShareResult = IIncomingShareSnapshot & {
  clearSharedPayloads: () => void;
  refreshSharePayloads: () => void;
};
