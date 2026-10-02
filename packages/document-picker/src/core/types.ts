export type IDocumentPickerOptions = {
  /** MIME type(s) to allow, wildcards included (`'image/*'`). Default: any type. */
  type?: string | string[];
  /** Copy the picked file into the app's cache dir. iOS + Android. Default `true`. */
  copyToCacheDirectory?: boolean;
  /** Allow multiple files. Default `false`. */
  multiple?: boolean;
};

export type IDocumentPickerAsset = {
  name: string;
  size?: number;
  uri: string;
  mimeType?: string;
  lastModified: number;
};

export type IDocumentPickerSuccessResult = {
  canceled: false;
  assets: IDocumentPickerAsset[];
};

export type IDocumentPickerCanceledResult = {
  canceled: true;
  assets: null;
};

export type IDocumentPickerResult =
  IDocumentPickerSuccessResult | IDocumentPickerCanceledResult;
