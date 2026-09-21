export type IJsonValue =
  | string
  | number
  | boolean
  | null
  | IJsonValue[]
  | { [key: string]: IJsonValue };

export type IJsonObject = Record<string, IJsonValue>;

export function isJsonObject(value: unknown): value is IJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
