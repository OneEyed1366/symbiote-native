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
