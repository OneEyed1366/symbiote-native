import { transform } from 'lightningcss';
import type { Declaration } from 'lightningcss';

// Build-time Node globals: this package wires no `@types/node`, and `transform` speaks Uint8Array
declare const TextEncoder: { new (): { encode(input: string): Uint8Array } };
declare const TextDecoder: { new (): { decode(input: Uint8Array): string } };

const SERIALIZER_TEMPLATE = new TextEncoder().encode('.s{color:red}');
const SERIALIZER_DECODER = new TextDecoder();

// The Rust side rejects `null` in an optional field such as a `var()` fallback, so it is left out
function withoutNulls(declaration: Declaration): Declaration {
  return JSON.parse(
    JSON.stringify(declaration, (_key, value) => value ?? undefined),
  );
}

/**
 * The CSS text of one declaration's VALUE, from lightningcss's own printer
 * It swaps the declarations of a one-rule stylesheet for ours and reads the value out of the
 * printed rule, so no second serializer exists to drift from it
 */
export function serializeValue(declaration: Declaration): string | null {
  try {
    const result = transform({
      filename: 'symbiote-declaration.css',
      code: SERIALIZER_TEMPLATE,
      visitor: {
        Rule: {
          style(rule) {
            rule.value.declarations = {
              declarations: [withoutNulls(declaration)],
              importantDeclarations: [],
            };
            return rule;
          },
        },
      },
    });

    const css = SERIALIZER_DECODER.decode(result.code);
    const open = css.indexOf('{');
    const close = css.lastIndexOf('}');
    if (open === -1 || close <= open) return null;

    const body = css
      .slice(open + 1, close)
      .trim()
      .replace(/;$/, '');
    const colon = body.indexOf(':');
    return colon === -1 ? null : body.slice(colon + 1).trim();
  } catch {
    return null;
  }
}
