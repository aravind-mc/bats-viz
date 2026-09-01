import { getSqlPresetGroups } from "./sql-presets.js";
import { isDuckDBReady, runSql } from "./duckdb.js";
import { recommendView, VIEW_ORDER } from "./sql-recommender.js";
import { renderSqlChart } from "./sql-views.js";

/** @type {{ columns: string[], rows: Record<string, unknown>[], sql: string } | null} */
export let userResult = null;

/** @type {import('./sql-recommender.js').ViewRecommendation | null} */
let recommendation = null;

/** @type {import('./sql-recommender.js').SqlViewType} */
let activeView = "table";

/** @type {{
  editor: HTMLTextAreaElement,
  errorEl: HTMLElement,
  resultsEl: HTMLElement,
  rowCountEl: HTMLElement,
  viewTabs: HTMLElement,
  chartArea: HTMLElement,
} | null} */
let sqlUi = null;

function $(sel, root = document) {
  return root.querySelector(sel);
}

function buildPresetPaletteHtml() {
  return getSqlPresetGroups().map((group) => `
    <div class="sql-preset-group" data-view="${group.view}">
      <div class="sql-preset-group-head">
        <span class="sql-view-badge sql-view-badge--${group.view}">${group.label}</span>
      </div>
      <div class="sql-preset-chips">
        ${group.presets.map((preset, i) => `
          <button type="button" class="sql-preset-chip" data-view="${group.view}" data-index="${i}" title="${preset.label}">
            <span class="sql-preset-chip-label">${preset.label}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `).join("");
}

/**
 * @param {{ onDuckReady?: () => void }} opts
 */
export function initSqlTab({ onDuckReady }) {
  const panel = $("#sql-panel");
  if (!panel || panel.dataset.wired) return;
  panel.dataset.wired = "1";

  panel.innerHTML = `
    <div class="sql-workspace">
      <div class="sql-toolbar">
        <button type="button" id="sql-run" class="sql-run-btn">Run</button>
        <span class="sql-toolbar-hint">⌘/Ctrl + Enter</span>
        <span id="sql-row-count" class="sql-meta"></span>
      </div>
      <div class="sql-split">
        <aside class="sql-preset-palette" aria-label="Query presets">
          <h3 class="sql-preset-heading">Presets</h3>
          <p class="sql-preset-sub">Click to load</p>
          <div class="sql-preset-groups">${buildPresetPaletteHtml()}</div>
        </aside>
        <div class="sql-editor-pane">
          <textarea id="sql-editor" class="sql-editor" spellcheck="false" rows="10" aria-label="SQL editor">SELECT sector, ROUND(AVG(bats), 1) AS avg_bats, COUNT(*) AS n
FROM v_tickers
GROUP BY sector
ORDER BY avg_bats DESC</textarea>
          <p id="sql-error" class="sql-error" hidden></p>
        </div>
      </div>
      <div id="sql-results" class="sql-results" hidden>
        <nav class="sql-view-tabs" aria-label="Result views"></nav>
        <div id="sql-chart-area" class="chart-plot sql-chart-area"></div>
      </div>
      <p id="sql-unavailable" class="sql-unavailable" hidden></p>
    </div>`;

  const editor = /** @type {HTMLTextAreaElement} */ ($("#sql-editor", panel));
  const errorEl = /** @type {HTMLElement} */ ($("#sql-error", panel));
  const resultsEl = /** @type {HTMLElement} */ ($("#sql-results", panel));
  const unavailableEl = /** @type {HTMLElement} */ ($("#sql-unavailable", panel));
  const rowCountEl = /** @type {HTMLElement} */ ($("#sql-row-count", panel));
  const viewTabs = /** @type {HTMLElement} */ ($(".sql-view-tabs", panel));
  const chartArea = /** @type {HTMLElement} */ ($("#sql-chart-area", panel));
  const presetChips = panel.querySelectorAll(".sql-preset-chip");
  const runBtn = $("#sql-run", panel);

  sqlUi = { editor, errorEl, resultsEl, rowCountEl, viewTabs, chartArea };

  const setPresetsDisabled = (disabled) => {
    presetChips.forEach((btn) => { btn.disabled = disabled; });
  };

  const enableWorkspace = () => {
    if (runBtn) runBtn.disabled = false;
    editor.disabled = false;
    setPresetsDisabled(false);
    unavailableEl.hidden = true;
    onDuckReady?.();
  };

  const disableWorkspace = (message) => {
    if (runBtn) runBtn.disabled = true;
    editor.disabled = true;
    setPresetsDisabled(true);
    unavailableEl.hidden = false;
    unavailableEl.textContent = message;
  };

  if (isDuckDBReady()) {
    enableWorkspace();
  } else {
    disableWorkspace("Starting DuckDB…");
    window.addEventListener("duckdb-ready", enableWorkspace, { once: true });
    window.addEventListener("duckdb-failed", (e) => {
      const detail = /** @type {CustomEvent} */ (e).detail;
      disableWorkspace(`SQL unavailable: ${detail}. Gallery still works on the JSON snapshot.`);
    }, { once: true });
  }

  presetChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const view = chip.dataset.view;
      const index = Number(chip.dataset.index);
      const group = getSqlPresetGroups().find((g) => g.view === view);
      const preset = group?.presets[index];
      if (!preset) return;
      editor.value = preset.sql;
      presetChips.forEach((c) => c.classList.toggle("active", c === chip));
      editor.focus();
    });
  });

  runBtn?.addEventListener("click", () => runSqlQuery(editor.value));
  editor.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runSqlQuery(editor.value);
    }
  });
}

function runBtnBusy(busy) {
  const btn = $("#sql-run");
  if (btn) {
    btn.disabled = busy;
    btn.textContent = busy ? "Running…" : "Run";
  }
}

/**
 * @param {string} sql
 */
export async function runSqlQuery(sql) {
  if (!sqlUi) throw new Error("SQL tab not initialized");
  const { editor, errorEl, resultsEl, rowCountEl, viewTabs, chartArea } = sqlUi;

  errorEl.hidden = true;
  errorEl.textContent = "";
  editor.value = sql;
  runBtnBusy(true);

  try {
    const result = await runSql(sql);
    userResult = result;
    recommendation = recommendView(result.columns, result.rows);
    activeView = recommendation.defaultView;
    resultsEl.hidden = false;
    rowCountEl.textContent = `${result.rowCount} row${result.rowCount === 1 ? "" : "s"}`;
    buildViewTabs(viewTabs, chartArea);
    renderActiveView(chartArea);
    return result;
  } catch (err) {
    userResult = null;
    recommendation = null;
    resultsEl.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    runBtnBusy(false);
  }
}

function buildViewTabs(viewTabs, chartArea) {
  if (!recommendation) return;
  viewTabs.innerHTML = VIEW_ORDER.map((view) => {
    const enabled = recommendation.enabled[view];
    const tip = enabled ? "" : recommendation.tooltips[view];
    const cls = ["sql-view-tab", view === activeView ? "active" : "", enabled ? "" : "disabled"].filter(Boolean).join(" ");
    return `<button type="button" class="${cls}" data-view="${view}" ${enabled ? "" : "disabled"} title="${tip}">${capitalize(view)}</button>`;
  }).join("");

  viewTabs.querySelectorAll(".sql-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled || !userResult || !recommendation) return;
      activeView = /** @type {import('./sql-recommender.js').SqlViewType} */ (btn.dataset.view);
      viewTabs.querySelectorAll(".sql-view-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderActiveView(chartArea);
    });
  });
}

function renderActiveView(chartArea) {
  if (!recommendation || !userResult) return;
  if (activeView === "table") {
    chartArea.classList.remove("sql-chart-area");
  } else {
    chartArea.classList.add("sql-chart-area");
  }
  renderSqlChart(chartArea, activeView, userResult.columns, userResult.rows, recommendation.mapping);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * @param {import('./sql-recommender.js').SqlViewType} view
 */
export function setActiveSqlView(view) {
  if (!recommendation || !userResult) {
    throw new Error("No SQL result. Run a query first.");
  }
  if (!recommendation.enabled[view]) {
    throw new Error(recommendation.tooltips[view] || `View not available: ${view}`);
  }
  activeView = view;
  if (sqlUi) {
    sqlUi.viewTabs.querySelectorAll(".sql-view-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view);
    });
    renderActiveView(sqlUi.chartArea);
  }
  return { active_view: activeView };
}

export function listActiveViews() {
  if (!recommendation) {
    return { default_view: "table", views: [] };
  }
  return {
    default_view: recommendation.defaultView,
    active_view: activeView,
    views: VIEW_ORDER.map((view) => ({
      type: view,
      enabled: recommendation.enabled[view],
      tooltip: recommendation.enabled[view] ? "" : recommendation.tooltips[view],
    })),
  };
}

/** @param {string} sql */
export function setSqlAndRun(sql) {
  return runSqlQuery(sql);
}

export function getActiveSqlView() {
  return activeView;
}

export function getRecommendation() {
  return recommendation;
}

export function getSqlEditorValue() {
  return sqlUi?.editor.value || "";
}
