import * as api from "./app-api.js";

/** @returns {Document & { modelContext?: ModelContext }} */
function getModelContext() {
  const doc = /** @type {Document & { modelContext?: ModelContext }} */ (document);
  const nav = /** @type {Navigator & { modelContext?: ModelContext }} */ (navigator);
  return doc.modelContext || nav.modelContext || null;
}

/**
 * @typedef {object} ModelContext
 * @property {(tool: object, options?: { signal?: AbortSignal }) => Promise<void>} registerTool
 */

const SQL_VIEW_TYPES = [
  "table", "bar", "lollipop", "rose", "heatmap", "scatter", "histogram",
  "beeswarm", "box", "ecdf", "treemap", "packed", "radar", "parallel", "highlight",
];

/**
 * @param {unknown} err
 */
function toolError(err) {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

export function initWebMCP() {
  const modelContext = getModelContext();
  if (!modelContext?.registerTool) {
    console.info("WebMCP: modelContext not available (enable chrome://flags/#enable-webmcp-testing in Chrome 146+).");
    return;
  }

  const controller = new AbortController();
  window.addEventListener("pagehide", () => controller.abort(), { once: true });

  const opts = { signal: controller.signal };

  const register = async (tool) => {
    await modelContext.registerTool(tool, opts);
  };

  (async () => {
    await register({
      name: "get_schema",
      description: "List DuckDB tables and views in the BATS snapshot (reports, scores, dims, v_tickers).",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        try {
          return { ok: true, schema: await api.getSchemaInfo() };
        } catch (err) {
          return toolError(err);
        }
      },
      annotations: { readOnlyHint: true },
    });

    await register({
      name: "set_filters",
      description: "Set global gallery filters: sectors, min/max BATS, zeros_only. Re-renders all gallery charts.",
      inputSchema: {
        type: "object",
        properties: {
          sectors: { type: "array", items: { type: "string" }, description: "Sector names to include (empty = all)." },
          min_bats: { type: "number", minimum: 0, maximum: 100 },
          max_bats: { type: "number", minimum: 0, maximum: 100 },
          zeros_only: { type: "boolean" },
        },
      },
      async execute({ sectors, min_bats, max_bats, zeros_only } = {}) {
        try {
          return {
            ok: true,
            filters: api.setFilters({ sectors, min_bats, max_bats, zeros_only }),
          };
        } catch (err) {
          return toolError(err);
        }
      },
    });

    await register({
      name: "list_charts",
      description: "List all 25 built-in gallery chart ids with title and one-line caption.",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        return { ok: true, charts: api.listCharts() };
      },
      annotations: { readOnlyHint: true },
    });

    await register({
      name: "show_chart",
      description: "Switch to Gallery tab and scroll to a chart card by id (e.g. sector_avg_bar).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Gallery chart id from list_charts." },
        },
        required: ["id"],
      },
      async execute({ id }) {
        try {
          return { ok: true, chart: api.showChart(id) };
        } catch (err) {
          return toolError(err);
        }
      },
    });

    await register({
      name: "select_mark",
      description: "Select a ticker or sector mark; opens side panel with 15 dimension scores.",
      inputSchema: {
        type: "object",
        properties: {
          sector: { type: "string" },
          ticker: { type: "string" },
          dim_id: { type: "integer", minimum: 1, maximum: 15 },
        },
      },
      async execute({ sector, ticker, dim_id } = {}) {
        try {
          return { ok: true, selection: api.selectMark({ sector, ticker, dim_id }) };
        } catch (err) {
          return toolError(err);
        }
      },
    });

    await register({
      name: "open_report",
      description: "Open the full BotFlo report on score.botflo.com for a slug or current selection.",
      inputSchema: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Report slug; defaults to current selection." },
        },
      },
      async execute({ slug } = {}) {
        try {
          return { ok: true, ...api.openReport(slug) };
        } catch (err) {
          return toolError(err);
        }
      },
    });

    await register({
      name: "run_sql",
      description: "Run read-only SQL in the SQL tab (SELECT/WITH/DESCRIBE). Returns result shape and enabled views.",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 500 },
        },
        required: ["sql"],
      },
      async execute({ sql, limit }) {
        try {
          return { ok: true, ...(await api.runSql(sql, limit)) };
        } catch (err) {
          return toolError(err);
        }
      },
    });

    await register({
      name: "list_active_views",
      description: "List which SQL result view tabs are enabled for the current query result.",
      inputSchema: { type: "object", properties: {} },
      async execute() {
        return { ok: true, ...api.listActiveViewsForAgent() };
      },
      annotations: { readOnlyHint: true },
    });

    await register({
      name: "set_sql_view",
      description: "Switch SQL result drawing without re-running the query.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: SQL_VIEW_TYPES },
        },
        required: ["type"],
      },
      async execute({ type }) {
        try {
          return { ok: true, ...api.setSqlView(type) };
        } catch (err) {
          return toolError(err);
        }
      },
    });

    await register({
      name: "get_result",
      description: "Return up to 50 rows from the current SQL result, or a gallery ticker preview if no SQL has run.",
      inputSchema: {
        type: "object",
        properties: {
          cap: { type: "integer", minimum: 1, maximum: 50, default: 50 },
        },
      },
      async execute({ cap } = {}) {
        return { ok: true, ...api.getResult(cap ?? 50) };
      },
      annotations: { readOnlyHint: true },
    });

    console.info("WebMCP: registered 10 tools for BATS Visualisation.");
  })().catch((err) => {
    console.error("WebMCP registration failed:", err);
  });
}
