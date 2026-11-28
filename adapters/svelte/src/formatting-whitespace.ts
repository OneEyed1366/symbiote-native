// Whitespace-only text under a parent that takes no raw text is the gap between two sibling tags
// A parent that is a `<Text>` keeps it, as there the space is a word boundary

// Wider than svelte's own class: a raw text under a non-text parent cannot paint whatever it holds
// So `&nbsp;`, `&emsp;` and the zero-width family drop here, and a nbsp inside a `<Text>` stays
const ZERO_WIDTH = String.fromCharCode(0x200b, 0x200c, 0x200d, 0xfeff);

export function isWhitespaceOnly(value: string): boolean {
  if (value === '') return false;
  return [...value].every(char => /\s/.test(char) || ZERO_WIDTH.includes(char));
}
