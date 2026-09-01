import { getAllScores, getAllTickers, getDims } from "./data.js";

/** @typedef {{ slug: string | null, ticker: string | null, sector: string | null, dim_id: number | null }} Selection */

/** @type {Selection} */
export const selection = {
  slug: null,
  ticker: null,
  sector: null,
  dim_id: null,
};

const REPORT_BASE = "https://score.botflo.com/report.html";

function $(sel) {
  return document.querySelector(sel);
}

/**
 * @param {{ slug: string, ticker: string, sector: string, dim_id?: number | null }} sel
 */
export function setSelection(sel) {
  selection.slug = sel.slug;
  selection.ticker = sel.ticker;
  selection.sector = sel.sector;
  selection.dim_id = sel.dim_id ?? null;
  renderPanel();
  const panel = $("#selection-panel");
  if (panel) panel.hidden = false;
}

export function getSelection() {
  return { ...selection };
}

export function clearSelection() {
  selection.slug = null;
  selection.ticker = null;
  selection.sector = null;
  selection.dim_id = null;
  const panel = $("#selection-panel");
  if (panel) panel.hidden = true;
}

/**
 * @param {{ sector?: string, ticker?: string, dim_id?: number }} mark
 */
export function selectMark(mark) {
  const tickers = getAllTickers();
  let row = null;

  if (mark.ticker) {
    row = tickers.find((r) => r.ticker.toUpperCase() === mark.ticker.toUpperCase()) || null;
  } else if (mark.sector) {
    row = tickers
      .filter((r) => r.sector === mark.sector)
      .sort((a, b) => b.bats - a.bats)[0] || null;
  }

  if (!row) {
    throw new Error(mark.ticker
      ? `Ticker not found: ${mark.ticker}`
      : mark.sector
        ? `No ticker found in sector: ${mark.sector}`
        : "Provide sector or ticker");
  }

  setSelection({
    slug: row.slug,
    ticker: row.ticker,
    sector: row.sector,
    dim_id: mark.dim_id ?? null,
  });

  return getSelection();
}

/**
 * @param {string} [slug]
 */
export function openReport(slug) {
  const target = slug || selection.slug;
  if (!target) throw new Error("No slug selected. Call select_mark first or pass slug.");
  const url = `${REPORT_BASE}?slug=${encodeURIComponent(target)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  return { url, slug: target };
}

function renderPanel() {
  const panel = $("#selection-panel");
  if (!panel || !selection.slug) return;

  const row = getAllTickers().find((r) => r.slug === selection.slug);
  if (!row) return;

  const title = panel.querySelector(".selection-title");
  const meta = panel.querySelector(".selection-meta");
  const dimsEl = panel.querySelector(".selection-dims");
  if (!title || !meta || !dimsEl) return;

  title.textContent = `${row.ticker} · ${row.company || row.ticker}`;
  meta.textContent = `${row.sector} · BATS ${row.bats}`;

  const dims = getDims();
  const scores = getAllScores().filter((s) => s.slug === row.slug);
  dimsEl.replaceChildren();

  for (const d of dims) {
    const s = scores.find((x) => x.dim_id === d.dim_id);
    const pct = s && s.score_max ? (100 * s.score) / s.score_max : 0;
    const rowEl = document.createElement("div");
    rowEl.className = "selection-dim-row";
    if (selection.dim_id === d.dim_id) rowEl.classList.add("selected-dim");
    rowEl.innerHTML = `
      <span class="selection-dim-name">${d.dim_name}</span>
      <div class="selection-dim-bar"><div class="selection-dim-fill" style="width:${pct}%"></div></div>
      <span class="selection-dim-val">${s ? `${s.score}/${s.score_max}` : "—"}</span>`;
    dimsEl.appendChild(rowEl);
  }
}

export function initSelectionPanel() {
  const panel = $("#selection-panel");
  if (!panel || panel.dataset.wired) return;
  panel.dataset.wired = "1";

  panel.querySelector(".selection-close")?.addEventListener("click", clearSelection);
  panel.querySelector(".selection-open-report")?.addEventListener("click", () => {
    try {
      openReport();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  });
}
