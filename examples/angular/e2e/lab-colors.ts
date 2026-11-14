import { hexToRgb } from './pixel';

// Each colour is the one `StyleShowcase.lab.css` or `lab-panels.ts` gives a single branch of a
// single rule, so a pixel near it says which branch painted. No two share a value

// `@media` and `matchMedia`
export const ROSE = hexToRgb('#e63946');
export const TEAL = hexToRgb('#2a9d8f');
export const SCHEME_LIGHT = hexToRgb('#ff9f1c');
export const SCHEME_DARK = hexToRgb('#5e60ce');

// `@container` on a size container with a swatch and nested text
export const ORANGE = hexToRgb('#f4a261');
export const DARK = hexToRgb('#264653');
export const GLYPH_PLAIN = hexToRgb('#e76f51');
export const GLYPH_HELD = hexToRgb('#6a4c93');
export const PINK = hexToRgb('#ff006e');
export const BLUE = hexToRgb('#3a86ff');
export const FIRST_GLYPH_PLAIN = hexToRgb('#fb5607');
export const FIRST_GLYPH_HELD = hexToRgb('#06d6a0');

// `@container` on one axis, and a box that its own query does not style
export const AXIS_BOX_PLAIN = hexToRgb('#6d597a');
export const AXIS_BOX_HELD = hexToRgb('#ffd60a');
export const AXIS_WIDTH_PLAIN = hexToRgb('#c9184a');
export const AXIS_WIDTH_HELD = hexToRgb('#4361ee');
export const AXIS_HEIGHT_PLAIN = hexToRgb('#fcbf49');
export const AXIS_HEIGHT_HELD = hexToRgb('#2ec4b6');

// `var()` on the `:root` token and on the value the surface writes
export const VIOLET = hexToRgb('#8338ec');
export const AMBER = hexToRgb('#ffbe0b');

// `var()` precedence among `:root`, the surface and a declaration on the node
export const PREC_ROOT = hexToRgb('#00b4d8');
export const PREC_SURFACE = hexToRgb('#f72585');
export const PREC_NODE = hexToRgb('#9ef01a');
