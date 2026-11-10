// RN's own `UTFSequence`, named Unicode sequences so source code can stay ASCII
// @ts-expect-error - untyped Flow source
import UTFSequenceUpstream from 'react-native/Libraries/UTFSequence';

export type IUTFSequence = {
  readonly BOM: string;
  readonly BULLET: string;
  readonly BULLET_SP: string;
  readonly MIDDOT: string;
  readonly MIDDOT_SP: string;
  readonly MIDDOT_KATAKANA: string;
  readonly MDASH: string;
  readonly MDASH_SP: string;
  readonly NDASH: string;
  readonly NDASH_SP: string;
  readonly NEWLINE: string;
  readonly NBSP: string;
  readonly PIZZA: string;
  readonly TRIANGLE_LEFT: string;
  readonly TRIANGLE_RIGHT: string;
};

export const UTFSequence: IUTFSequence = UTFSequenceUpstream;
