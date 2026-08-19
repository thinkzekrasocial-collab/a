/**
 * Thin helpers around the D1 binding. All SQL is parameterised — never
 * concatenate user input into SQL strings.
 */

/**
 * Anything that can prepare a D1 statement — either the database itself or
 * a D1 session (transaction handle).
 */
export interface ExecutorLike {
  prepare(query: string): D1PreparedStatement;
}

type Executor = D1Database | ExecutorLike;

function toParam(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

export async function all<T = Record<string, unknown>>(
  exec: Executor,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const stmt = exec.prepare(sql);
  const bound = stmt.bind(...params.map(toParam));
  const result = await bound.all();
  return (result.results ?? []) as unknown as T[];
}

export async function one<T = Record<string, unknown>>(
  exec: Executor,
  sql: string,
  ...params: unknown[]
): Promise<T | undefined> {
  const rows = await all<T>(exec, sql, ...params);
  return rows[0];
}

export async function run(
  exec: Executor,
  sql: string,
  ...params: unknown[]
): Promise<unknown> {
  const stmt = exec.prepare(sql);
  const bound = stmt.bind(...params.map(toParam));
  return bound.run();
}

/**
 * Run `fn` inside a D1 session (transaction) when supported.
 * Falls back to plain execution on older runtimes.
 */
export async function tx<T>(
  db: D1Database,
  fn: (exec: Executor) => Promise<T>
): Promise<T> {
  const sessionApi = db as unknown as {
    withSession?: (cb: (session: ExecutorLike) => Promise<T>) => Promise<T>;
  };
  if (typeof sessionApi.withSession === "function") {
    return sessionApi.withSession(fn);
  }
  return fn(db);
}
