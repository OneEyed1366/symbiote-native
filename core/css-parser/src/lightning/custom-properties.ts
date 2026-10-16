import { transform } from 'lightningcss';
import { tokensToText, type ITokenPrinter } from './token-text.ts';

// Build-time Node global: this package wires no `@types/node`, and lightningcss takes a Uint8Array
declare const TextEncoder: { new (): { encode(input: string): Uint8Array } };

const STYLE_RULE = 'style';
const CUSTOM_PROPERTY = 'custom';

/**
 * Every custom property (`--x`) declared anywhere in the file, name -> its raw value text. It is a
 * pass of its own, since nothing orders `:root` first, and the last declaration of a name wins
 * Values are stored verbatim, and `declarationToStyle` resolves a `var()` chain
 */
export function variablesIn(
  css: string,
  filename: string,
): ReadonlyMap<string, string> {
  const variables = new Map<string, string>();
  if (!css) return variables;

  try {
    const printer: ITokenPrinter = {
      variables,
      varMode: 'keep',
      missing: [],
    };
    transform({
      filename,
      code: new TextEncoder().encode(css),
      // A malformed rule elsewhere in the file must not cost the tokens that are declared
      errorRecovery: true,
      visitor: {
        Rule(rule) {
          if (rule.type !== STYLE_RULE) return;

          const block = rule.value.declarations;
          for (const declaration of [
            ...block.declarations,
            ...block.importantDeclarations,
          ]) {
            if (declaration.property !== CUSTOM_PROPERTY) continue;

            const name = declaration.value.name;
            if (!name.startsWith('--')) continue;

            const text = tokensToText(declaration.value.value, printer);
            if (text !== null) variables.set(name, text.trim());
          }
        },
      },
    });
  } catch {
    return variables;
  }

  return variables;
}
