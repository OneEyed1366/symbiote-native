export function required(text: string, label: string): string {
  if (text.trim() === '') {
    throw new Error(`fill the ${label} field first`);
  }
  return text.trim();
}

export function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}
