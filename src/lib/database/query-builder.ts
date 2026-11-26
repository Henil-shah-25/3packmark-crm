/**
 * Parameterized SQL Query Builder & Injection Guard
 * Developster Hub CRM — Phase 5 Security Remediation
 * 
 * Enforces:
 * 1. 100% Parameterized queries ($1, $2, ...) for all values.
 * 2. Strict allowlisting for identifiers (table names, column names, sort directions).
 * 3. Prevention of arbitrary SQL string concatenation or template literal injection.
 * 4. Standard intuitive parameter ordering: buildUpdateQuery(table, updates, where, returning).
 */

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface ParameterizedQuery {
  text: string;
  values: any[];
}

/**
 * Standard identifier regex: letters, numbers, underscores only.
 * Disallows quotes, spaces, hyphens, semicolons, comments, or operators.
 */
const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate that an identifier (table name or column name) is safe.
 * Throws an error if invalid, preventing SQL injection via identifiers.
 */
export function assertSafeIdentifier(identifier: string): string {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Invalid SQL identifier: Identifier must be a non-empty string');
  }
  const clean = identifier.trim();
  if (!SAFE_IDENTIFIER_REGEX.test(clean)) {
    throw new Error(`SQL Injection Attempt Detected: Malformed identifier "${identifier}"`);
  }
  return clean;
}

/**
 * Validate sorting direction strictly to 'ASC' or 'DESC'.
 */
export function assertSafeSortDirection(direction?: string | null): 'ASC' | 'DESC' {
  if (!direction) return 'ASC';
  const upper = String(direction).trim().toUpperCase();
  if (upper === 'ASC' || upper === 'DESC') return upper;
  throw new Error(`SQL Injection Attempt Detected: Malformed sort direction "${direction}"`);
}

/**
 * Safely builds a parameterized SELECT query.
 */
export function buildSelectQuery(params: {
  table: string;
  columns?: string[];
  fields?: string[]; // Alias for columns (supports LOW-05)
  where?: Record<string, any>;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC' | string;
  limit?: number;
  offset?: number;
}): ParameterizedQuery {
  const safeTable = assertSafeIdentifier(params.table);
  
  // Safe column list: supports columns or fields alias
  const cols = params.columns || params.fields;
  let columnsClause = '*';
  if (cols && cols.length > 0) {
    columnsClause = cols.map(assertSafeIdentifier).join(', ');
  }

  const values: any[] = [];
  const whereClauses: string[] = [];

  if (params.where) {
    for (const [key, val] of Object.entries(params.where)) {
      if (val === undefined) continue;
      const safeCol = assertSafeIdentifier(key);
      if (val === null) {
        whereClauses.push(`${safeCol} IS NULL`);
      } else {
        values.push(val);
        whereClauses.push(`${safeCol} = $${values.length}`);
      }
    }
  }

  let text = `SELECT ${columnsClause} FROM ${safeTable}`;
  if (whereClauses.length > 0) {
    text += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  if (params.orderBy) {
    const safeOrderBy = assertSafeIdentifier(params.orderBy);
    const safeDir = assertSafeSortDirection(params.orderDirection);
    text += ` ORDER BY ${safeOrderBy} ${safeDir}`;
  }

  if (params.limit !== undefined && !isNaN(params.limit) && params.limit >= 0) {
    values.push(Math.floor(params.limit));
    text += ` LIMIT $${values.length}`;
  }

  if (params.offset !== undefined && !isNaN(params.offset) && params.offset >= 0) {
    values.push(Math.floor(params.offset));
    text += ` OFFSET $${values.length}`;
  }

  return { text, values };
}

/**
 * Safely builds a parameterized INSERT query.
 */
export function buildInsertQuery(
  table: string,
  record: Record<string, any>,
  returning: string = '*'
): ParameterizedQuery {
  const safeTable = assertSafeIdentifier(table);
  const keys = Object.keys(record);
  if (keys.length === 0) {
    throw new Error('Cannot build INSERT query with empty record object');
  }

  const safeColumns = keys.map(assertSafeIdentifier);
  const values: any[] = [];
  const placeholders: string[] = [];

  for (const key of keys) {
    values.push(record[key]);
    placeholders.push(`$${values.length}`);
  }

  let text = `INSERT INTO ${safeTable} (${safeColumns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  if (returning) {
    const safeReturning = returning === '*' ? '*' : returning.split(',').map(s => assertSafeIdentifier(s.trim())).join(', ');
    text += ` RETURNING ${safeReturning}`;
  }

  return { text, values };
}

/**
 * Safely builds a parameterized UPDATE query.
 * Standard signature: (table, updates, where, returning)
 * Remediated from (table, where, updates) to resolve MED-06.
 */
export function buildUpdateQuery(
  table: string,
  updates: Record<string, any>,
  where: Record<string, any>,
  returning: string = '*'
): ParameterizedQuery {
  const safeTable = assertSafeIdentifier(table);
  const updateKeys = Object.keys(updates);
  if (updateKeys.length === 0) {
    throw new Error('Cannot build UPDATE query with empty updates object');
  }

  const values: any[] = [];
  const setClauses: string[] = [];

  for (const key of updateKeys) {
    const safeCol = assertSafeIdentifier(key);
    values.push(updates[key]);
    setClauses.push(`${safeCol} = $${values.length}`);
  }

  const whereClauses: string[] = [];
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    const safeCol = assertSafeIdentifier(key);
    if (val === null) {
      whereClauses.push(`${safeCol} IS NULL`);
    } else {
      values.push(val);
      whereClauses.push(`${safeCol} = $${values.length}`);
    }
  }

  if (whereClauses.length === 0) {
    throw new Error('Refusing to execute unconstrained UPDATE without WHERE clause');
  }

  let text = `UPDATE ${safeTable} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
  if (returning) {
    const safeReturning = returning === '*' ? '*' : returning.split(',').map(s => assertSafeIdentifier(s.trim())).join(', ');
    text += ` RETURNING ${safeReturning}`;
  }

  return { text, values };
}

/**
 * Safely builds a parameterized DELETE query.
 */
export function buildDeleteQuery(
  table: string,
  where: Record<string, any>
): ParameterizedQuery {
  const safeTable = assertSafeIdentifier(table);
  const values: any[] = [];
  const whereClauses: string[] = [];

  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    const safeCol = assertSafeIdentifier(key);
    if (val === null) {
      whereClauses.push(`${safeCol} IS NULL`);
    } else {
      values.push(val);
      whereClauses.push(`${safeCol} = $${values.length}`);
    }
  }

  if (whereClauses.length === 0) {
    throw new Error('Refusing to execute unconstrained DELETE without WHERE clause');
  }

  const text = `DELETE FROM ${safeTable} WHERE ${whereClauses.join(' AND ')}`;
  return { text, values };
}
