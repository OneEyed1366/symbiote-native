// Ported from expo-clipboard's own Clipboard.types.ts. ContentType and StringFormat are enums —
// kept unprefixed, matching this repo's convention for enums (see AuthenticationType /
// SecurityLevel in @symbiote-native/local-auth); the plain option/result shapes get this repo's
// `I`-prefix convention for exported types. `ClipboardPasteButton`'s own types
// (PasteEventPayload, TextPasteEvent, ImagePasteEvent, AcceptedContentType, CornerStyleType,
// DisplayModeType) are intentionally not ported — that native paste-button view is out of scope
// for this pass (see the package README).

/**
 * Type used to define what type of data is stored in the clipboard.
 */
export enum ContentType {
  PLAIN_TEXT = 'plain-text',
  HTML = 'html',
  IMAGE = 'image',
  /**
   * @platform iOS
   */
  URL = 'url',
}

/**
 * Type used to determine string format stored in the clipboard.
 */
export enum StringFormat {
  PLAIN_TEXT = 'plainText',
  HTML = 'html',
}

export type IGetStringOptions = {
  /**
   * The target format of the clipboard string to be converted to, if possible.
   * @default StringFormat.PLAIN_TEXT
   */
  preferredFormat?: StringFormat;
};

export type ISetStringOptions = {
  /**
   * The input format of the provided string. Adjusting this option can help other applications
   * interpret copied string properly.
   * @default StringFormat.PLAIN_TEXT
   */
  inputFormat?: StringFormat;
};

export type IGetImageOptions = {
  /**
   * The format of the clipboard image to be converted to.
   */
  format: 'png' | 'jpeg';
  /**
   * Specify the quality of the returned image, between `0` and `1`. Defaults to `1` (highest
   * quality). Applicable only when `format` is set to `jpeg`, ignored otherwise.
   * @default 1
   */
  jpegQuality?: number;
};

export type IClipboardImage = {
  /**
   * A Base64-encoded string of the image data, already prepended with a
   * `data:image/png;base64,` or `data:image/jpeg;base64,` prefix. Its format depends on the
   * `format` option passed to `getImageAsync`.
   */
  data: string;
  /**
   * Dimensions (`width` and `height`) of the image pasted from clipboard.
   */
  size: {
    width: number;
    height: number;
  };
};

export type IClipboardEvent = {
  /**
   * An array of content types that are available on the clipboard.
   */
  contentTypes: ContentType[];
};
