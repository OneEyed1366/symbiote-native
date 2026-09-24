// Ported verbatim (logic unchanged) from expo-sqlite's queryUtils.ts (.vendors/expo @
// origin/sdk-57, packages/expo-sqlite/src/queryUtils.ts), renamed with this repo's `I`-prefix
// convention. A reimplementation of Bun's SQLite query parser (credited upstream).

/** Information about a parsed SQL query. */
export type ISQLParsedInfo = {
  canReturnRows: boolean;
};

const SINGLE_QUOTED_STRING = /'(?:[^']|'')*'/g;
const DOUBLE_QUOTED_STRING = /"(?:[^"]|"")*"/g;
const RETURNING_KEYWORD = /\bRETURNING\b/i;
const MUTATION_KEYWORDS = /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i;
const QUERY_KEYWORDS = /\b(SELECT|PRAGMA|WITH|EXPLAIN)\b/i;

/**
 * Parses a SQL query to determine whether it can return rows, using a priority-based approach:
 * `RETURNING` always returns rows; a bare mutation keyword never does; a query keyword does;
 * anything else does not.
 *
 * @example
 * ```ts
 * parseSQLQuery('SELECT * FROM users') // { canReturnRows: true }
 * parseSQLQuery('INSERT INTO users VALUES (1)') // { canReturnRows: false }
 * parseSQLQuery('INSERT INTO users VALUES (1) RETURNING *') // { canReturnRows: true }
 * ```
 */
export function parseSQLQuery(query: string): ISQLParsedInfo {
  // SQLite doubles quotes to escape them ('don''t', "test""quote") — strip quoted strings first
  // so a keyword INSIDE a string literal can't produce a false positive.
  const cleaned = query
    .replace(SINGLE_QUOTED_STRING, "''")
    .replace(DOUBLE_QUOTED_STRING, '""');

  if (RETURNING_KEYWORD.test(cleaned)) {
    return { canReturnRows: true };
  }
  if (MUTATION_KEYWORDS.test(cleaned)) {
    return { canReturnRows: false };
  }
  if (QUERY_KEYWORDS.test(cleaned)) {
    return { canReturnRows: true };
  }
  return { canReturnRows: false };
}
