import { readFileSync } from 'node:fs';

// `origin` names the source, a bare SyntaxError does not say which of many files is broken
export function parseJson(text, origin) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON in ${origin}: ${error.message}`, {
      cause: error,
    });
  }
}

export function readJsonFile(path) {
  return parseJson(readFileSync(path, 'utf8'), path);
}
