// An OBJECT-shaped RN style value, such as `shadowOffset` and `textShadowOffset`, all numbers
export type IStyleValueObject = Readonly<Record<string, number>>;

// Array forms exist so the engine's own processors can take them, none is produced here today
export type IStyleValue =
  | string
  | number
  | IStyleValueObject
  | ReadonlyArray<string | number | IStyleValueObject>;

export type IStyleObject = Record<string, IStyleValue>;

export type IDeclarationContext = {
  readonly filename: string;
  /** Root font size for rem, default 16 */
  readonly remToPx?: number;
};
