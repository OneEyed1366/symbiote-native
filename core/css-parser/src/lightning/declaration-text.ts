// Round trips through lightningcss: a typed declaration back to CSS text, and text back to typed
import { transform } from 'lightningcss';
import type { Declaration } from 'lightningcss';

// Build-time Node globals: this package wires no `@types/node`, and lightningcss takes a Uint8Array
declare const TextEncoder: { new (): { encode(input: string): Uint8Array } };
declare const TextDecoder: { new (): { decode(input: Uint8Array): string } };

const SERIALIZER_TEMPLATE = new TextEncoder().encode('.s{color:red}');
const SERIALIZER_DECODER = new TextDecoder();
const STYLE_RULE = 'style';

/**
 * The CSS text of one declaration's VALUE, from lightningcss's own printer, for the `raw`
 * properties. It hands lightningcss a one-rule stylesheet with our declaration and reads it back
 */
export function serializeValue(declaration: Declaration): string | null {
  try {
    const result = transform({
      filename: 'symbiote-declaration.css',
      code: SERIALIZER_TEMPLATE,
      visitor: {
        Rule(rule) {
          if (rule.type !== STYLE_RULE) return;
          rule.value.declarations = {
            declarations: [declaration],
            importantDeclarations: [],
          };
          return rule;
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

/** One substituted declaration parsed again through lightningcss */
export function parseDeclarationText(
  cssProperty: string,
  valueText: string,
): Declaration[] {
  const parsed: Declaration[] = [];

  try {
    transform({
      filename: 'symbiote-substituted.css',
      code: new TextEncoder().encode(`.s{${cssProperty}:${valueText}}`),
      visitor: {
        Rule(rule) {
          if (rule.type !== STYLE_RULE) return;
          parsed.push(
            ...rule.value.declarations.declarations,
            ...rule.value.declarations.importantDeclarations,
          );
        },
      },
    });
  } catch {
    return [];
  }

  return parsed;
}
