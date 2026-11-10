import * as fs from 'node:fs';
import * as path from 'node:path';

const WORKLETS_PLUGIN = 'react-native-worklets/plugin';
const PLUGINS_OPENER = 'plugins: [';
const BABEL_CONFIG_FILE = 'babel.config.js';

// A string, a comment or a bracket, so that a bracket inside the first two is never counted
const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[[\]]/g;

function closingBracketOf(source: string, from: number): number | undefined {
  let depth = 1;
  for (const match of source.slice(from).matchAll(TOKEN)) {
    if (match[0] === '[') depth += 1;
    if (match[0] === ']') depth -= 1;
    if (depth === 0) return from + match.index;
  }
  return undefined;
}

function appendToOneLine(body: string): string {
  const entries = body.trimEnd();
  if (entries === '') return `'${WORKLETS_PLUGIN}'`;
  return `${entries}${entries.endsWith(',') ? ' ' : ', '}'${WORKLETS_PLUGIN}'`;
}

function appendToManyLines(body: string): string {
  const entries = body.trimEnd();
  const lastLine = entries.slice(entries.lastIndexOf('\n') + 1);
  const indent = /^\s*/.exec(lastLine)?.[0] ?? '';
  const comma = entries.endsWith(',') ? '' : ',';
  return `${entries}${comma}\n${indent}'${WORKLETS_PLUGIN}',${body.slice(entries.length)}`;
}

// The worklets plugin has to be the LAST entry of `plugins`, so it is appended, never prepended
// Returns the source unchanged when it already lists the plugin, undefined when no list is found
export function addWorkletsPlugin(source: string): string | undefined {
  if (source.includes(WORKLETS_PLUGIN)) return source;
  const opener = source.indexOf(PLUGINS_OPENER);
  if (opener === -1) return undefined;
  const bodyStart = opener + PLUGINS_OPENER.length;
  const bodyEnd = closingBracketOf(source, bodyStart);
  if (bodyEnd === undefined) return undefined;
  const body = source.slice(bodyStart, bodyEnd);
  const grown = /\n\s*$/.test(body)
    ? appendToManyLines(body)
    : appendToOneLine(body);
  return source.slice(0, bodyStart) + grown + source.slice(bodyEnd);
}

// True when the app's babel config lists the plugin afterwards, false when the developer has to
export function applyReanimatedBabelPlugin(root: string): boolean {
  const configPath = path.join(root, BABEL_CONFIG_FILE);
  if (!fs.existsSync(configPath)) return false;
  const source = fs.readFileSync(configPath, 'utf8');
  const updated = addWorkletsPlugin(source);
  if (updated === undefined) return false;
  if (updated !== source) fs.writeFileSync(configPath, updated);
  return true;
}
