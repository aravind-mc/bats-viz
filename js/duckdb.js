/** @type {typeof import('@duckdb/duckdb-wasm') | null} */
let duckdbModule = null;
/** @type {import('@duckdb/duckdb-wasm').AsyncDuckDB | null} */
let db = null;
/** @type {import('@duckdb/duckdb-wasm').AsyncDuckDBConnection | null} */
let conn = null;
let ready = false;
/** @type {string | null} */
let initError = null;

const VENDOR = new URL("../vendor/duckdb/", import.meta.url).href;

const LOCAL_BUNDLES = {
  mvp: {
    mainModule: `${VENDOR}duckdb-mvp.wasm`,
    mainWorker: `${VENDOR}duckdb-browser-mvp.worker.js`,
  },
  eh: {
    mainModule: `${VENDOR}duckdb-eh.wasm`,
    mainWorker: `${VENDOR}duckdb-browser-eh.worker.js`,
  },
};

export function isDuckDBReady() {
  return ready;
}

export function getDuckDBError() {
  return initError;
}

/**
 * @param {object[]} reports
 * @param {object[]} scores
 * @param {object[]} dims
 */
export async function initDuckDB(reports, scores, dims) {
  try {
    duckdbModule = await import(`${VENDOR}duckdb-browser.mjs`);
    const duckdb = duckdbModule;
    const bundle = await duckdb.selectBundle(LOCAL_BUNDLES);
    const worker = new Worker(bundle.mainWorker);
    const logger = new duckdb.ConsoleLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    conn = await db.connect();

    await db.registerFileText("reports.json", JSON.stringify(reports));
    await db.registerFileText("scores.json", JSON.stringify(scores));
    await db.registerFileText("dims.json", JSON.stringify(dims));

    await conn.query("CREATE TABLE reports AS SELECT * FROM read_json_auto('reports.json')");
    await conn.query("CREATE TABLE scores AS SELECT * FROM read_json_auto('scores.json')");
    await conn.query("CREATE TABLE dims AS SELECT * FROM read_json_auto('dims.json')");

    await conn.query(`
      CREATE VIEW v_tickers AS
      SELECT *
      FROM reports
      QUALIFY ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY call_date DESC) = 1
    `);

    ready = true;
    initError = null;
  } catch (err) {
    ready = false;
    initError = err instanceof Error ? err.message : String(err);
    console.error("DuckDB init failed:", err);
    throw err;
  }
}

/** @returns {Promise<{ tables: { name: string, type: string }[], views: { name: string }[] }>} */
export async function getSchema() {
  if (!conn) throw new Error("DuckDB not ready");
  const tables = await conn.query(`
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'main'
    ORDER BY table_name
  `);
  const rows = tablesToObjects(tables);
  return {
    tables: rows.filter((r) => r.table_type === "BASE TABLE").map((r) => ({ name: r.table_name, type: r.table_type })),
    views: rows.filter((r) => r.table_type === "VIEW").map((r) => ({ name: r.table_name })),
  };
}

/**
 * @param {string} sql
 * @returns {Promise<{ columns: string[], rows: Record<string, unknown>[], sql: string, rowCount: number }>}
 */
export async function runSql(sql) {
  if (!conn) throw new Error("DuckDB not ready");
  const guarded = guardSql(sql);
  const result = await conn.query(guarded);
  const { columns, rows } = tableToResult(result);
  return { columns, rows, sql: guarded, rowCount: rows.length };
}

/** @param {import('@duckdb/duckdb-wasm').Table} table */
function tableToResult(table) {
  const columns = table.schema.fields.map((f) => f.name);
  const rows = table.toArray().map((row) => {
    /** @type {Record<string, unknown>} */
    const obj = {};
    for (const col of columns) {
      obj[col] = normalizeValue(row[col]);
    }
    return obj;
  });
  return { columns, rows };
}

function tablesToObjects(table) {
  return tableToResult(table).rows;
}

/** @param {unknown} v */
function normalizeValue(v) {
  if (typeof v === "bigint") return Number(v);
  if (v && typeof v === "object" && "toJSON" in v && typeof v.toJSON === "function") {
    return v.toJSON();
  }
  return v;
}

/**
 * @param {string} sql
 */
export function guardSql(sql) {
  let trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!trimmed) throw new Error("Query is empty");

  const stripped = trimmed.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (stripped.includes(";")) throw new Error("Only one statement allowed");

  const head = stripped.replace(/^\s+/, "").toUpperCase();
  if (!/^(SELECT|WITH|DESCRIBE)\b/.test(head)) {
    throw new Error("Only SELECT, WITH, or DESCRIBE queries are allowed");
  }

  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|ATTACH|COPY|LOAD|INSTALL|EXPORT|PRAGMA|SET)\b/i;
  if (forbidden.test(stripped)) {
    throw new Error("Only read-only queries are allowed");
  }

  if (!/\bLIMIT\b/i.test(stripped) && !/^DESCRIBE\b/i.test(head)) {
    trimmed = `${trimmed}\nLIMIT 200`;
  } else if (/\bLIMIT\s+(\d+)\b/i.test(stripped)) {
    trimmed = stripped.replace(/\bLIMIT\s+(\d+)\b/i, (_, n) => {
      const cap = Math.min(parseInt(n, 10), 500);
      return `LIMIT ${cap}`;
    });
  }

  return trimmed;
}
