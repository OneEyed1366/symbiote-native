export enum FlipType {
  Vertical = 'vertical',
  Horizontal = 'horizontal',
}

export enum SaveFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
}

export type IActionResize = {
  /** Provide only one of `width`/`height` to preserve the image's ratio. */
  resize: { width?: number; height?: number };
};

export type IActionRotate = {
  /** Degrees, clockwise when positive, counter-clockwise when negative. */
  rotate: number;
};

export type IActionFlip = {
  flip: FlipType;
};

export type IActionCrop = {
  crop: { originX: number; originY: number; width: number; height: number };
};

/** @deprecated use `manipulate(source)` instead. */
export type IAction = IActionResize | IActionRotate | IActionFlip | IActionCrop;

export type ISaveOptions = {
  base64?: boolean;
  /** `0.0`-`1.0`; `1` is no compression (highest quality). Default `1`. */
  compress?: number;
  /** Default `SaveFormat.JPEG`. */
  format?: SaveFormat;
};

export type IImageResult = {
  uri: string;
  width: number;
  height: number;
  /** Set only when `base64` was truthy in `ISaveOptions`. */
  base64?: string;
};
