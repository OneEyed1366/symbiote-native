export type IPageMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type IPrintOrientation = {
  portrait: string;
  landscape: string;
};

export type IPrintOptions = {
  /** PDF file URI — remote, local, or a `data:application/pdf;base64,` URI. iOS + Android. */
  uri?: string;
  /** HTML string to print. iOS + Android. */
  html?: string;
  /** Page width in pixels. Defaults to 612 (US Letter @ 72 PPI). Only with `html`. */
  width?: number;
  /** Page height in pixels. Defaults to 792 (US Letter @ 72 PPI). Only with `html`. */
  height?: number;
  /** Printer URL from `selectPrinterAsync`. iOS only. */
  printerUrl?: string;
  /** Uses UIMarkupTextPrintFormatter instead of WebView — no images. iOS only. */
  useMarkupFormatter?: boolean;
  orientation?: string;
  margins?: IPageMargins;
};

export type IPrinter = {
  name: string;
  url: string;
};

export type IFilePrintOptions = {
  html?: string;
  useMarkupFormatter?: boolean;
  width?: number;
  height?: number;
  margins?: IPageMargins;
  base64?: boolean;
  /** Android only. Default 100. */
  textZoom?: number;
};

export type IFilePrintResult = {
  uri: string;
  numberOfPages: number;
  /** Present only when `base64` was requested; no `data:` prefix. */
  base64?: string;
};
