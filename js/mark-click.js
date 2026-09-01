import { selectMark } from "./selection-panel.js";

/**
 * Plot `href` channel — only for marks that represent one ticker.
 * @param {{ ticker?: string, name?: string }} d
 */
export function tickerHref(d) {
  const ticker = d?.ticker || null;
  if (!ticker) return undefined;
  return `#ticker=${encodeURIComponent(ticker)}`;
}

/**
 * Open selection panel for a ticker (never sector-only aggregates).
 * @param {{ ticker?: string, slug?: string, name?: string }} d
 */
export function selectTicker(d) {
  const ticker = d?.ticker || (d?.name && d?.sector ? d.name : null) || null;
  if (!ticker) return;
  try {
    selectMark({ ticker });
  } catch (err) {
    console.warn("select ticker failed:", err);
  }
}

/** @param {MouseEvent} event */
function onTickerLinkClick(event) {
  let node = event.target instanceof Element ? event.target : null;
  while (node && node !== event.currentTarget) {
    const tag = node.tagName?.toLowerCase();
    if (tag === "a") {
      const href = node.getAttribute("href")
        || node.getAttributeNS("http://www.w3.org/1999/xlink", "href")
        || "";
      if (href.startsWith("#ticker=")) {
        event.preventDefault();
        event.stopPropagation();
        const ticker = decodeURIComponent(href.slice("#ticker=".length));
        if (ticker) selectTicker({ ticker });
        return;
      }
    }
    node = node.parentElement;
  }
}

/**
 * Mount a Plot figure with no selection clicks (aggregates).
 * @param {HTMLElement} el
 * @param {SVGSVGElement | HTMLElement} plot
 */
export function mountPlot(el, plot) {
  el.classList.remove("chart-clickable");
  el.replaceChildren(plot);
}

/**
 * Mount a Plot figure; marks with tickerHref become clickable.
 * @param {HTMLElement} el
 * @param {SVGSVGElement | HTMLElement} plot
 */
export function mountTickerPlot(el, plot) {
  el.replaceChildren(plot);
  el.classList.add("chart-clickable");
  if (el.dataset.tickerClickWired) return;
  el.dataset.tickerClickWired = "1";
  el.addEventListener("click", onTickerLinkClick);
}

/**
 * Wire a plain table / SVG container for ticker row clicks (listener once).
 * @param {HTMLElement} el
 */
export function ensureTickerClickRoot(el) {
  el.classList.add("chart-clickable");
  if (el.dataset.tickerClickWired) return;
  el.dataset.tickerClickWired = "1";
  el.addEventListener("click", onTickerLinkClick);
}
