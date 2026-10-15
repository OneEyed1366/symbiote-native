/**
 * An OBJECT-shaped RN style value, all-number: `shadowOffset` and `textShadowOffset` are the two
 * that exist
 */
export type IStyleValueObject = Readonly<Record<string, number>>;

/**
 * One React Native style value. Six properties are array-capable in RN (`transform`, `boxShadow`,
 * `filter`, `experimental_backgroundImage`, `transformOrigin`, `fontVariant`), but all are `raw`
 * in the table: the engine's own processors read their CSS text at commit time
 */
export type IStyleValue =
  | string
  | number
  | IStyleValueObject
  | ReadonlyArray<string | number | IStyleValueObject>;

export type IStyleObject = Record<string, IStyleValue>;

export type IDeclarationContext = {
  readonly filename: string;
  /** Custom properties (`--x`) collected from the whole file, name -> raw value text */
  readonly variables: ReadonlyMap<string, string>;
  /** Root font size for rem, default 16 */
  readonly remToPx?: number;
};
