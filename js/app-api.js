import {
  filters,
  getAllSectors,
  getAllTickers,
  getFilteredTickers,
  CHART_SQL,
} from "./data.js";
import { CHART_RENDERERS } from "./charts.js";
import { getSchema, isDuckDBReady } from "./duckdb.js";
import {
  getActiveSqlView,
  getRecommendation,
  getSqlEditorValue,
  listActiveViews,
  runSqlQuery,
  setActiveSqlView,
  userResult,
} from "./sql-tab.js";
import { getSelection, selectMark, openReport } from "./selection-panel.js";

/** @type {{ switchTab: (tab: string) => void, renderGallery: () => void, syncFiltersToDom: () => void, galleryOrder: string[] }} */
let ctx = {
  switchTab: () => {},
  renderGallery: () => {},
  syncFiltersToDom: () => {},
  galleryOrder: [],
};

/**
 * @param {Partial<typeof ctx>} callbacks
 */
export function initAppApi(callbacks) {
  ctx = { ...ctx, ...callbacks };
}

export function getFilters() {
  return {
    sectors: [...filters.sectors],
    min_bats: filters.minBats,
    max_bats: filters.maxBats,
    zeros_only: filters.zerosOnly,
    ticker_count: getFilteredTickers().length,
  };
}

/**
 * @param {{ sectors?: string[], min_bats?: number | null, max_bats?: number | null, zeros_only?: boolean }} next
 */
export function setFilters(next) {
  if (next.sectors !== undefined) filters.sectors = [...next.sectors];
  if (next.min_bats !== undefined) filters.minBats = next.min_bats;
  if (next.max_bats !== undefined) filters.maxBats = next.max_bats;
  if (next.zeros_only !== undefined) filters.zerosOnly = next.zeros_only;
  ctx.syncFiltersToDom();
  ctx.renderGallery();
  return getFilters();
}

export function listCharts() {
  return ctx.galleryOrder.map((id) => ({
    id,
    title: CHART_RENDERERS[id]?.title || id,
    why: CHART_RENDERERS[id]?.caption || "",
  }));
}

export async function getSchemaInfo() {
  if (isDuckDBReady()) {
    const schema = await getSchema();
    return { duckdb_ready: true, ...schema };
  }
  return {
    duckdb_ready: false,
    tables: [
      { name: "reports", type: "BASE TABLE" },
      { name: "scores", type: "BASE TABLE" },
      { name: "dims", type: "BASE TABLE" },
    ],
    views: [{ name: "v_tickers" }],
    note: "DuckDB not ready; schema from snapshot layout.",
  };
}

/**
 * @param {string} id
 */
export function showChart(id) {
  if (!CHART_RENDERERS[id]) throw new Error(`Unknown chart id: ${id}`);
  ctx.switchTab("gallery");
  const el = document.getElementById(`chart-${id}`);
  if (!el) throw new Error(`Chart card not found: ${id}`);
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  const url = new URL(location.href);
  url.searchParams.set("tab", "gallery");
  url.searchParams.set("chart", id);
  history.replaceState(null, "", url);
  return { id, title: CHART_RENDERERS[id].title };
}

export { selectMark, openReport, getSelection };

/**
 * @param {string} sql
 * @param {number} [limit]
 */
export async function runSql(sql, limit) {
  ctx.switchTab("sql");
  let query = sql.trim();
  if (limit != null) {
    query = query.replace(/\bLIMIT\s+\d+\b/i, "").replace(/;+\s*$/, "");
    query = `${query}\nLIMIT ${Math.min(Math.max(1, limit), 500)}`;
  }
  const result = await runSqlQuery(query);
  const rec = getRecommendation();
  return {
    columns: result.columns,
    rows: result.rows.slice(0, 50),
    row_count: result.rowCount,
    sql: result.sql,
    recommended_view: rec?.defaultView || "table",
    enabled_views: listActiveViews(),
    active_view: getActiveSqlView(),
  };
}

export function listActiveViewsForAgent() {
  return listActiveViews();
}

/**
 * @param {import('./sql-recommender.js').SqlViewType} type
 */
export function setSqlView(type) {
  return setActiveSqlView(type);
}

/**
 * @param {number} [cap]
 */
export function getResult(cap = 50) {
  const max = Math.min(Math.max(1, cap), 50);
  if (userResult) {
    return {
      source: "sql",
      columns: userResult.columns,
      rows: userResult.rows.slice(0, max),
      row_count: userResult.rowCount,
      sql: userResult.sql,
      active_view: getActiveSqlView(),
    };
  }

  const rows = getFilteredTickers();
  const preview = rows.slice(0, max).map((r) => ({
    ticker: r.ticker,
    sector: r.sector,
    bats: r.bats,
    sector_ai: r.sector_ai,
  }));

  return {
    source: "gallery",
    columns: ["ticker", "sector", "bats", "sector_ai"],
    rows: preview,
    row_count: rows.length,
    sql: CHART_SQL.sector_avg_bar,
    note: "Gallery preview of filtered tickers; run_sql for custom results.",
  };
}

export function getActiveTab() {
  const sqlPanel = document.getElementById("sql-panel");
  return sqlPanel && !sqlPanel.hidden ? "sql" : "gallery";
}

export function getAppState() {
  return {
    tab: getActiveTab(),
    filters: getFilters(),
    selection: getSelection(),
    sql_view: getActiveSqlView(),
    has_sql_result: Boolean(userResult),
    editor_sql: getSqlEditorValue(),
    sectors_available: getAllSectors(),
    ticker_count: getAllTickers().length,
  };
}
