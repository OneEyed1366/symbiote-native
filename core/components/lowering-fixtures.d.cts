// Hand-written types for the loose `.cjs` beside this file — Babel/Metro transforms cannot import
// `.ts`, so the table stays CommonJS and its shape is declared here.

export type IVerdict = 'lower' | 'refuse';

export interface ILoweringCase {
  /** Stable key each adapter's test maps to its own snippet. */
  id: string;
  /** One line naming the construct, for a failure message that reads without the table open. */
  what: string;
  /** The answer every transform must give. */
  expected: IVerdict;
  /** Why that is the answer — the reasoning a transform author needs, not a restatement. */
  why: string;
}

export declare const LOWERING_CASES: ReadonlyArray<ILoweringCase>;
