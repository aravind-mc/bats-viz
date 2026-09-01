import {
  loadData,
  getAllSectors,
  getFilteredTickers,
  getAllTickers,
  getAllScores,
  getDims,
  filters,
  chartState,
  CHART_SQL,
} from "./data.js";
import { CHART_RENDERERS } from "./charts.js";
import { initDuckDB, isDuckDBReady, getDuckDBError } from "./duckdb.js";
import { initSqlTab } from "./sql-tab.js";
import { initSelectionPanel } from "./selection-panel.js";
import { initAppApi } from "./app-api.js";
import { initWebMCP } from "./webmcp.js";

const GALLERY_ORDER = [
  "top20_bar",
  "sector_avg_bar",
  "sector_pct_zero",
  "sector_pct_ge70",
  "bats_histogram",
  "sector_hist_small_multiples",
  "sector_box",
  "zeros_list",
  "scatter_bats_sector_ai",
  "scatter_tone_evidence",
  "quadrant_strategy_execution",
  "heatmap_sector_dim",
  "corr_heatmap",
  "dim_leaders",
  "radar_ticker_vs_sector",
  "waterfall_ticker_dims",
  "diverging_hype_gap",
  "treemap_sector_n",
  "packed_circles_ticker_bats",
  "beeswarm_sector",
  "lollipop_sector_vs_book_avg",
  "ecdf_bats",
  "highlight_table_sector_kpis",
  "rose_sector_avg",
  "parallel_coords_dims",
];

function $(sel) {
  return document.querySelector(sel);
}

function updateStatus(count) {
  const el = $("#status");
  const duck = isDuckDBReady() ? "DuckDB ready" : `DuckDB off (${getDuckDBError() || "unavailable"})`;
  el.textContent = `Ready · ${count} tickers · 15 dimensions · ${duck}`;
  el.classList.add("ready");
}

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });
  $("#gallery").hidden = tab !== "gallery";
  $("#sql-panel").hidden = tab !== "sql";
  const url = new URL(location.href);
  url.searchParams.set("tab", tab);
  history.replaceState(null, "", url);
}

function openSqlEditor(sql) {
  switchTab("sql");
  const editor = document.getElementById("sql-editor");
  if (editor) editor.value = sql;
}

function syncFiltersToDom() {
  const sectorSelect = $("#filter-sectors");
  if (sectorSelect) {
    for (const opt of sectorSelect.options) {
      opt.selected = filters.sectors.length === 0 || filters.sectors.includes(opt.value);
    }
  }
  const minEl = $("#filter-min");
  const maxEl = $("#filter-max");
  const zerosEl = $("#filter-zeros");
  if (minEl) minEl.value = filters.minBats == null ? "" : String(filters.minBats);
  if (maxEl) maxEl.value = filters.maxBats == null ? "" : String(filters.maxBats);
  if (zerosEl) zerosEl.checked = filters.zerosOnly;
}

function wireFilters(onChange) {
  const sectorSelect = $("#filter-sectors");
  sectorSelect.innerHTML = getAllSectors()
    .map((s) => `<option value="${s}">${s}</option>`)
    .join("");

  sectorSelect.addEventListener("change", () => {
    filters.sectors = [...sectorSelect.selectedOptions].map((o) => o.value);
    onChange();
  });

  $("#filter-min").addEventListener("input", (e) => {
    filters.minBats = e.target.value === "" ? null : Number(e.target.value);
    onChange();
  });

  $("#filter-max").addEventListener("input", (e) => {
    filters.maxBats = e.target.value === "" ? null : Number(e.target.value);
    onChange();
  });

  $("#filter-zeros").addEventListener("change", (e) => {
    filters.zerosOnly = e.target.checked;
    onChange();
  });
}

function controlHtml(id, type) {
  const rows = getFilteredTickers();
  if (type === "sector") {
    const sectors = getAllSectors();
    const opts = sectors.map((s) => `<option value="${s}"${s === chartState.beeswarmSector ? " selected" : ""}>${s}</option>`).join("");
    return `<label class="chart-control">Sector <select data-control="sector" data-chart="${id}">${opts}</select></label>`;
  }
  if (type === "dim") {
    const dims = getDims();
    const opts = dims.map((d) => `<option value="${d.dim_id}"${d.dim_id === chartState.dimLeadersId ? " selected" : ""}>${d.dim_name}</option>`).join("");
    return `<label class="chart-control">Dimension <select data-control="dim" data-chart="${id}">${opts}</select></label>`;
  }
  if (type === "ticker-radar") {
    const opts = [...rows].sort((a, b) => b.bats - a.bats).map((r) => `<option value="${r.ticker}"${r.ticker === chartState.radarTicker ? " selected" : ""}>${r.ticker}</option>`).join("");
    return `<label class="chart-control">Ticker <select data-control="ticker-radar" data-chart="${id}">${opts}</select></label>`;
  }
  if (type === "ticker-waterfall") {
    const opts = [...rows].sort((a, b) => b.bats - a.bats).map((r) => `<option value="${r.ticker}"${r.ticker === chartState.waterfallTicker ? " selected" : ""}>${r.ticker}</option>`).join("");
    return `<label class="chart-control">Ticker <select data-control="ticker-waterfall" data-chart="${id}">${opts}</select></label>`;
  }
  return "";
}

function wireChartControls(onChange) {
  const gallery = $("#gallery");
  if (gallery.dataset.controlsWired) return;
  gallery.dataset.controlsWired = "1";
  gallery.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-control]");
    if (!sel) return;
    const kind = sel.dataset.control;
    if (kind === "sector") chartState.beeswarmSector = sel.value;
    if (kind === "dim") chartState.dimLeadersId = Number(sel.value);
    if (kind === "ticker-radar") chartState.radarTicker = sel.value;
    if (kind === "ticker-waterfall") chartState.waterfallTicker = sel.value;
    onChange();
  });
}

function renderGallery() {
  const rows = getFilteredTickers();
  updateStatus(rows.length);

  for (const id of GALLERY_ORDER) {
    const card = document.querySelector(`[data-chart="${id}"]`);
    if (!card) continue;
    const plotEl = card.querySelector(".chart-plot");
    const { render } = CHART_RENDERERS[id];
    try {
      render(plotEl, rows);
    } catch (err) {
      plotEl.innerHTML = `<p class="chart-error">${err.message}</p>`;
      console.error(id, err);
    }
  }
}

function buildGalleryCards() {
  const gallery = $("#gallery");
  gallery.innerHTML = GALLERY_ORDER.map((id) => {
    const { title, caption, controls } = CHART_RENDERERS[id];
    const ctrl = controls ? `<div class="chart-controls">${controlHtml(id, controls)}</div>` : "";
    return `
      <article class="chart-card" data-chart="${id}" id="chart-${id}">
        <h2>${title}</h2>
        <p class="caption">${caption}</p>
        ${ctrl}
        <div class="chart-plot" role="img" aria-label="${title}"></div>
        <div class="card-footer">
          <button type="button" class="copy-sql" data-sql-id="${id}">Copy SQL</button>
        </div>
      </article>`;
  }).join("");

  gallery.querySelectorAll(".copy-sql").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sql = CHART_SQL[btn.dataset.sqlId] || "-- SQL preset coming soon";
      await navigator.clipboard.writeText(sql);
      openSqlEditor(sql);
      const label = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = label; }, 1500);
    });
  });
}

function wireTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.disabled) return;
      switchTab(tab.dataset.tab);
    });
  });
}

async function init() {
  try {
    $("#status").textContent = "Loading data…";
    await loadData();

    buildGalleryCards();
    initSelectionPanel();
    wireFilters(renderGallery);
    wireChartControls(renderGallery);
    wireTabs();
    initAppApi({
      switchTab,
      renderGallery,
      syncFiltersToDom,
      galleryOrder: GALLERY_ORDER,
    });
    initSqlTab({
      onDuckReady: () => updateStatus(getFilteredTickers().length),
    });
    initWebMCP();
    renderGallery();

    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab === "sql" || tab === "gallery") switchTab(tab);

    const chartId = params.get("chart");
    if (chartId) {
      document.getElementById(`chart-${chartId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    $("#status").textContent = "Starting DuckDB…";
    initDuckDB(getAllTickers(), getAllScores(), getDims())
      .then(() => {
        window.dispatchEvent(new Event("duckdb-ready"));
        updateStatus(getFilteredTickers().length);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        window.dispatchEvent(new CustomEvent("duckdb-failed", { detail: msg }));
        updateStatus(getFilteredTickers().length);
      });
  } catch (err) {
    $("#status").textContent = `Error: ${err.message}`;
    console.error(err);
  }
}

init();
