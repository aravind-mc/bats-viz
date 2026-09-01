import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm";
import {
  aggregateBySector,
  batsHistogramBuckets,
  bookAvgBats,
  chartState,
  dimCorrelationMatrix,
  ecdfData,
  getDims,
  getFilteredScores,
  hypeGapData,
  pivotScores,
  quartiles,
  sectorDimHeatmapData,
} from "./data.js";
import {
  renderHighlightTable as renderHighlightTableCustom,
  renderPackedCircles as renderPackedCirclesCustom,
  renderParallelCoords as renderParallelCoordsCustom,
  renderRadarTickerVsSector as renderRadarCustom,
  renderRoseSectorAvg as renderRoseCustom,
  renderTreemapSectorN as renderTreemapCustom,
  renderWaterfallTickerDims as renderWaterfallCustom,
  renderZerosList as renderZerosListCustom,
} from "./chart-custom.js";
import { mountPlot, mountTickerPlot, tickerHref } from "./mark-click.js";

const SECTOR_COLORS = [
  "#4e79a7", "#59a14f", "#f28e2b", "#e15759", "#76b7b2",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac", "#86bcb6",
];

const INK = "#1a1a1a";
const INK_MUTED = "#5c5c5c";
const GRID = "#e8e4dc";
const MEASURE = "#2563eb";
const PLOT_BG = "#ffffff";

const sectorColorMap = new Map();
function colorForSector(sector) {
  if (!sectorColorMap.has(sector)) {
    sectorColorMap.set(sector, SECTOR_COLORS[sectorColorMap.size % SECTOR_COLORS.length]);
  }
  return sectorColorMap.get(sector);
}

function basePlotStyle() {
  return {
    style: { background: PLOT_BG, color: INK_MUTED, fontFamily: "system-ui, sans-serif" },
    color: { scheme: "blues" },
  };
}

function axisStyle() {
  return { tickColor: GRID, grid: true, gridColor: GRID, labelColor: INK_MUTED };
}

function plotWidth(el) {
  return Math.min(900, el.clientWidth || 900);
}

function renderCtx(el, rows) {
  const scores = getFilteredScores(rows);
  const pivoted = pivotScores(scores, rows);
  return { scores, pivoted };
}

export function renderSectorAvgBar(el, rows) {
  const data = aggregateBySector(rows);
  mountPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: Math.max(280, data.length * 28),
    marginLeft: 150,
    marginRight: 80,
    x: { label: "Average BATS", domain: [0, 100], ...axisStyle() },
    y: { label: null, tickColor: GRID, labelColor: INK_MUTED },
    marks: [
      Plot.barX(data, { x: "avg_bats", y: "sector", fill: (d) => colorForSector(d.sector), tip: true }),
      Plot.text(data, { x: "avg_bats", y: "sector", text: (d) => `${d.avg_bats.toFixed(1)} (n=${d.n})`, dx: 6, textAnchor: "start", fill: INK, fontSize: 11 }),
    ],
  }));
}

export function renderSectorPctZero(el, rows) {
  const data = [...aggregateBySector(rows)].sort((a, b) => b.pct_zero - a.pct_zero);
  mountPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: Math.max(280, data.length * 28),
    marginLeft: 150,
    marginRight: 60,
    x: { label: "% tickers with BATS = 0", domain: [0, 100], tickFormat: (d) => `${d}%`, ...axisStyle() },
    y: { label: null, tickColor: GRID, labelColor: INK_MUTED },
    marks: [
      Plot.barX(data, { x: "pct_zero", y: "sector", fill: (d) => colorForSector(d.sector), tip: true }),
      Plot.text(data, { x: "pct_zero", y: "sector", text: (d) => `${d.pct_zero.toFixed(1)}%`, dx: 6, textAnchor: "start", fill: INK, fontSize: 11 }),
    ],
  }));
}

export function renderSectorPctGe70(el, rows) {
  const data = [...aggregateBySector(rows)].sort((a, b) => b.pct_ge70 - a.pct_ge70);
  mountPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: Math.max(280, data.length * 28),
    marginLeft: 150,
    marginRight: 60,
    x: { label: "% tickers with BATS ≥ 70", domain: [0, 100], tickFormat: (d) => `${d}%`, ...axisStyle() },
    y: { label: null, tickColor: GRID, labelColor: INK_MUTED },
    marks: [
      Plot.barX(data, { x: "pct_ge70", y: "sector", fill: (d) => colorForSector(d.sector), tip: true }),
      Plot.text(data, { x: "pct_ge70", y: "sector", text: (d) => `${d.pct_ge70.toFixed(1)}%`, dx: 6, textAnchor: "start", fill: INK, fontSize: 11 }),
    ],
  }));
}

export function renderBatsHistogram(el, rows) {
  const data = batsHistogramBuckets(rows);
  mountPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: 320,
    marginBottom: 40,
    x: { label: "BATS score bucket", domain: data.map((d) => d.bucket), tickColor: GRID, labelColor: INK_MUTED },
    y: { label: "Tickers", ...axisStyle() },
    marks: [
      Plot.barY(data, { x: "bucket", y: "count", fill: MEASURE, tip: true }),
      Plot.text(data, { x: "bucket", y: "count", text: "count", dy: -6, fill: INK, fontSize: 11 }),
    ],
  }));
}

export function renderSectorSmallMultiples(el, rows) {
  const sectors = [...new Set(rows.map((r) => r.sector))].sort();
  mountPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: Math.max(400, sectors.length * 52),
    marginLeft: 140,
    facet: { data: rows, y: "sector", marginBottom: 0, label: null },
    x: { label: "BATS", domain: [0, 100], ...axisStyle() },
    y: { label: "Count", ...axisStyle() },
    marks: [
      Plot.rectY(rows, Plot.binX({ y: "count" }, { x: "bats", thresholds: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] }), { fill: MEASURE }),
    ],
  }));
}

export function renderSectorBox(el, rows) {
  const sectors = [...new Set(rows.map((r) => r.sector))].sort();
  const boxData = sectors.map((sector) => {
    const vals = rows.filter((r) => r.sector === sector).map((r) => r.bats);
    const q = quartiles(vals);
    return { sector, ...q, n: vals.length };
  });
  const marks = [
    Plot.ruleX(boxData, { x1: "min", x2: "max", y: "sector", stroke: INK_MUTED, strokeWidth: 1 }),
    Plot.ruleX(boxData, { x1: "q1", x2: "q3", y: "sector", stroke: MEASURE, strokeWidth: 6, strokeLinecap: "round" }),
    Plot.dot(boxData, { x: "median", y: "sector", fill: INK, r: 4 }),
  ];
  const small = rows.filter((r) => {
    const n = rows.filter((x) => x.sector === r.sector).length;
    return n <= 25;
  });
  if (small.length) {
    marks.push(Plot.dot(small, Plot.dodgeY({ x: "bats", y: "sector", fill: (d) => colorForSector(d.sector), r: 2.5, fillOpacity: 0.5 })));
  }
  mountPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: Math.max(280, sectors.length * 28),
    marginLeft: 150,
    x: { label: "BATS", domain: [0, 100], ...axisStyle() },
    y: { label: null, tickColor: GRID, labelColor: INK_MUTED },
    marks,
  }));
}

export function renderTop20Bar(el, rows) {
  const data = [...rows].sort((a, b) => b.bats - a.bats).slice(0, 20);
  mountTickerPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: Math.max(320, data.length * 22),
    marginLeft: 56,
    marginRight: 40,
    x: { label: "BATS", domain: [0, 100], ...axisStyle() },
    y: { label: null, tickColor: GRID, labelColor: INK_MUTED },
    marks: [
      Plot.barX(data, {
        x: "bats", y: "ticker", fill: (d) => colorForSector(d.sector), tip: true,
        title: (d) => `${d.ticker} · ${d.sector}\nBATS ${d.bats}`,
        href: tickerHref, target: "_self",
      }),
      Plot.text(data, { x: "bats", y: "ticker", text: "bats", dx: 4, textAnchor: "start", fill: INK, fontSize: 10 }),
    ],
  }));
}

export function renderZerosList(el, rows) {
  renderZerosListCustom(el, rows);
}

export function renderScatterBatsSectorAi(el, rows) {
  mountTickerPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: 380,
    marginLeft: 50,
    x: { label: "BATS", domain: [0, 100], ...axisStyle() },
    y: { label: "Sector AI score", domain: [0, 50], ...axisStyle() },
    marks: [
      Plot.dot(rows, {
        x: "bats", y: "sector_ai", fill: (d) => colorForSector(d.sector), r: 3.5, fillOpacity: 0.7, tip: true,
        title: (d) => `${d.ticker}\nBATS ${d.bats} · sector AI ${d.sector_ai}`,
        href: tickerHref, target: "_self",
      }),
    ],
  }));
}

export function renderScatterToneEvidence(el, rows) {
  const { pivoted } = renderCtx(el, rows);
  mountTickerPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: 380,
    x: { label: "Tone (dim 3)", ...axisStyle() },
    y: { label: "Evidence (dim 8)", ...axisStyle() },
    marks: [
      Plot.dot(pivoted, {
        x: "d3", y: "d8", r: (d) => 2 + d.bats / 25, fill: (d) => colorForSector(d.sector), fillOpacity: 0.65, tip: true,
        title: (d) => `${d.ticker}\ntone ${d.d3} · evidence ${d.d8}`,
        href: tickerHref, target: "_self",
      }),
    ],
  }));
}

export function renderQuadrantStrategyExecution(el, rows) {
  const { pivoted } = renderCtx(el, rows);
  const dims = getDims();
  const d2max = 9;
  const d11max = 6;
  mountTickerPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: 380,
    x: { label: dims.find((d) => d.dim_id === 2)?.dim_name || "Centrality", domain: [0, d2max], ...axisStyle() },
    y: { label: dims.find((d) => d.dim_id === 11)?.dim_name || "Hype vs execution", domain: [0, d11max], ...axisStyle() },
    marks: [
      Plot.ruleX([d2max / 2], { stroke: GRID, strokeDasharray: "4,4" }),
      Plot.ruleY([d11max / 2], { stroke: GRID, strokeDasharray: "4,4" }),
      Plot.dot(pivoted, {
        x: "d2", y: "d11", fill: (d) => colorForSector(d.sector), r: 3.5, fillOpacity: 0.7, tip: true,
        title: (d) => d.ticker,
        href: tickerHref, target: "_self",
      }),
    ],
  }));
}

export function renderHeatmapSectorDim(el, rows) {
  const { scores } = renderCtx(el, rows);
  const data = sectorDimHeatmapData(scores, rows);
  const sectors = [...new Set(data.map((d) => d.sector))].sort();
  const dimNames = getDims().map((d) => d.dim_name);
  mountPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: Math.max(320, sectors.length * 28 + 80),
    marginLeft: 140,
    marginBottom: 100,
    x: { label: null, domain: dimNames, tickRotate: -45 },
    y: { label: null, domain: sectors },
    color: { type: "linear", domain: [0, 1], range: ["#eff6ff", "#1d4ed8"], label: "Avg score / max" },
    marks: [
      Plot.cell(data, { x: "dim_name", y: "sector", fill: "pct", tip: true, title: (d) => `${d.sector} · ${d.dim_name}\n${(d.pct * 100).toFixed(0)}%` }),
    ],
  }));
}

export function renderCorrHeatmap(el, rows) {
  const { scores } = renderCtx(el, rows);
  const matrix = dimCorrelationMatrix(scores, rows);
  const dims = getDims();
  const labels = dims.map((d) => `D${d.dim_id}`);
  const labelMap = new Map(dims.map((d) => [d.dim_id, `D${d.dim_id}`]));
  const data = matrix.map((m) => ({ ...m, a: labelMap.get(m.dim_a), b: labelMap.get(m.dim_b) }));
  mountPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: 420,
    marginLeft: 50,
    marginBottom: 50,
    x: { label: null, domain: labels, tickRotate: -45 },
    y: { label: null, domain: labels },
    color: { type: "diverging", domain: [-1, 1], scheme: "RdBu", pivot: 0 },
    marks: [Plot.cell(data, { x: "a", y: "b", fill: "r", tip: true, title: (d) => `r = ${d.r.toFixed(2)}` })],
  }));
}

export function renderDimLeaders(el, rows) {
  const { scores } = renderCtx(el, rows);
  const dimId = chartState.dimLeadersId;
  const dim = getDims().find((d) => d.dim_id === dimId);
  const slugs = new Set(rows.map((r) => r.slug));
  const data = scores
    .filter((s) => s.dim_id === dimId && slugs.has(s.slug))
    .map((s) => {
      const r = rows.find((x) => x.slug === s.slug);
      return { ticker: r?.ticker, score: s.score, sector: r?.sector };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
  mountTickerPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: Math.max(300, data.length * 22),
    marginLeft: 56,
    x: { label: dim?.dim_name || "Score", ...axisStyle() },
    y: { label: null, tickColor: GRID, labelColor: INK_MUTED },
    marks: [
      Plot.barX(data, {
        x: "score", y: "ticker", fill: (d) => colorForSector(d.sector), tip: true,
        href: tickerHref, target: "_self",
      }),
      Plot.text(data, { x: "score", y: "ticker", text: "score", dx: 4, textAnchor: "start", fill: INK, fontSize: 10 }),
    ],
  }));
}

export function renderRadarTickerVsSector(el, rows) {
  renderRadarCustom(el, rows, getFilteredScores(rows));
}

export function renderWaterfallTickerDims(el, rows) {
  renderWaterfallCustom(el, rows, getFilteredScores(rows));
}

export function renderDivergingHypeGap(el, rows) {
  const { scores } = renderCtx(el, rows);
  const data = hypeGapData(rows, scores)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 50)
    .sort((a, b) => a.gap - b.gap);
  const [xMin, xMax] = d3Extent(data, (d) => d.gap);
  const pad = Math.max(Math.abs(xMin), Math.abs(xMax)) * 0.1 || 1;
  mountTickerPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: Math.max(400, data.length * 10),
    marginLeft: 56,
    x: { label: "Tone − evidence", domain: [xMin - pad, xMax + pad], ...axisStyle() },
    y: { label: null, domain: data.map((d) => d.ticker), tickColor: GRID, labelColor: INK_MUTED },
    marks: [
      Plot.ruleX([0], { stroke: INK_MUTED }),
      Plot.barX(data, {
        x: "gap", y: "ticker", fill: (d) => (d.gap >= 0 ? "#e15759" : "#4e79a7"), tip: true,
        href: tickerHref, target: "_self",
      }),
    ],
  }));
}

function d3Extent(data, accessor) {
  let min = Infinity;
  let max = -Infinity;
  for (const d of data) {
    const v = accessor(d);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

export function renderTreemapSectorN(el, rows) {
  renderTreemapCustom(el, rows);
}

export function renderPackedCircles(el, rows) {
  renderPackedCirclesCustom(el, rows);
}

export function renderBeeswarmSector(el, rows) {
  const sector = chartState.beeswarmSector || rows[0]?.sector;
  const data = rows.filter((r) => r.sector === sector);
  mountTickerPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: 120,
    marginLeft: 40,
    x: { label: `BATS — ${sector}`, domain: [0, 100], ...axisStyle() },
    y: { label: null, domain: [0, 1] },
    marks: [
      Plot.dot(data, Plot.dodgeY({
        x: "bats", y: () => 0.5, fill: MEASURE, r: 5, tip: true,
        title: (d) => `${d.ticker}: ${d.bats}`,
        href: tickerHref, target: "_self",
      })),
    ],
  }));
}

export function renderLollipopSectorVsBookAvg(el, rows) {
  const bookAvg = bookAvgBats(rows);
  const data = aggregateBySector(rows).map((d) => ({ ...d, gap: d.avg_bats - bookAvg }));
  mountPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: Math.max(280, data.length * 28),
    marginLeft: 150,
    x: { label: "Avg BATS − book avg", ...axisStyle() },
    y: { label: null, tickColor: GRID, labelColor: INK_MUTED },
    marks: [
      Plot.ruleX([0], { stroke: INK_MUTED, strokeDasharray: "4,4" }),
      Plot.ruleX(data, { x1: 0, x2: "gap", y: "sector", stroke: MEASURE, strokeWidth: 2 }),
      Plot.dot(data, { x: "gap", y: "sector", fill: (d) => colorForSector(d.sector), r: 5, tip: true }),
      Plot.text(data, { x: "gap", y: "sector", text: (d) => `${d.gap >= 0 ? "+" : ""}${d.gap.toFixed(1)}`, dx: 8, textAnchor: "start", fill: INK, fontSize: 10 }),
    ],
  }));
}

export function renderEcdfBats(el, rows) {
  const data = ecdfData(rows);
  mountPlot(el, Plot.plot({
    ...basePlotStyle(),
    width: plotWidth(el),
    height: 320,
    x: { label: "BATS", domain: [0, 100], ...axisStyle() },
    y: { label: "% of tickers at or below", domain: [0, 100], tickFormat: (d) => `${d}%`, ...axisStyle() },
    marks: [
      Plot.line(data, { x: "bats", y: "pct", stroke: MEASURE, strokeWidth: 2 }),
      Plot.dot(data.filter((_, i) => i % 30 === 0), { x: "bats", y: "pct", fill: MEASURE, r: 2 }),
    ],
  }));
}

export function renderHighlightTable(el, rows) {
  renderHighlightTableCustom(el, rows);
}

export function renderRoseSectorAvg(el, rows) {
  renderRoseCustom(el, rows);
}

export function renderParallelCoords(el, rows) {
  renderParallelCoordsCustom(el, rows, getFilteredScores(rows));
}

export const CHART_RENDERERS = {
  sector_avg_bar: { title: "Sector average bar", caption: "Average BATS by sector, with ticker count on each bar.", render: renderSectorAvgBar, controls: null },
  sector_pct_zero: { title: "Silent sectors", caption: "Share of tickers with BATS = 0 in each sector.", render: renderSectorPctZero, controls: null },
  sector_pct_ge70: { title: "High-score share", caption: "Share of tickers with BATS ≥ 70 in each sector.", render: renderSectorPctGe70, controls: null },
  bats_histogram: { title: "Score histogram", caption: "Distribution of BATS scores across the book in buckets of 10.", render: renderBatsHistogram, controls: null },
  sector_hist_small_multiples: { title: "Small-multiple histograms", caption: "One mini histogram per sector.", render: renderSectorSmallMultiples, controls: null },
  sector_box: { title: "Box / band by sector", caption: "Median, quartiles, and range of BATS; beeswarm overlay when a sector has ≤25 tickers.", render: renderSectorBox, controls: null },
  top20_bar: { title: "Top 20 tickers", caption: "Highest BATS scores, colored by sector.", render: renderTop20Bar, controls: null },
  zeros_list: { title: "Bottom / zeros list", caption: "Tickers with BATS = 0, grouped by sector.", render: renderZerosList, controls: null },
  scatter_bats_sector_ai: { title: "BATS vs sector AI scatter", caption: "One point per ticker; sector AI is the sector-specific rubric total.", render: renderScatterBatsSectorAi, controls: null },
  scatter_tone_evidence: { title: "Hype scatter", caption: "Management tone (dim 3) vs measurable evidence (dim 8); dot size = BATS.", render: renderScatterToneEvidence, controls: null },
  quadrant_strategy_execution: { title: "Quadrant", caption: "Strategic centrality (dim 2) vs hype vs execution (dim 11); mid-scale guides.", render: renderQuadrantStrategyExecution, controls: null },
  heatmap_sector_dim: { title: "Sector × dimension heatmap", caption: "Cell = average score ÷ max, so dimensions are comparable.", render: renderHeatmapSectorDim, controls: null },
  corr_heatmap: { title: "Dimension correlation", caption: "15×15 Pearson correlation on pivoted dimension scores.", render: renderCorrHeatmap, controls: null },
  dim_leaders: { title: "Dimension leaders", caption: "Top 15 tickers on the selected dimension (default: Agentic).", render: renderDimLeaders, controls: "dim" },
  radar_ticker_vs_sector: { title: "Radar vs sector", caption: "Selected ticker's normalized dimension scores vs sector average.", render: renderRadarTickerVsSector, controls: "ticker-radar" },
  waterfall_ticker_dims: { title: "Waterfall of one ticker", caption: "Each dimension's points stacked toward 100.", render: renderWaterfallTickerDims, controls: "ticker-waterfall" },
  diverging_hype_gap: { title: "Diverging hype gap", caption: "Tone minus evidence by ticker (50 largest gaps at each tail).", render: renderDivergingHypeGap, controls: null },
  treemap_sector_n: { title: "Treemap of the book", caption: "Sector tiles sized by ticker count.", render: renderTreemapSectorN, controls: null },
  packed_circles_ticker_bats: { title: "Packed circles", caption: "One circle per ticker; area ∝ BATS.", render: renderPackedCircles, controls: null },
  beeswarm_sector: { title: "Beeswarm of a sector", caption: "Each ticker a dot on the BATS axis for the selected sector.", render: renderBeeswarmSector, controls: "sector" },
  lollipop_sector_vs_book_avg: { title: "Lollipop sector gap", caption: "Sector average BATS minus book-wide average.", render: renderLollipopSectorVsBookAvg, controls: null },
  ecdf_bats: { title: "ECDF", caption: "Cumulative share of tickers at or below each BATS value.", render: renderEcdfBats, controls: null },
  highlight_table_sector_kpis: { title: "Highlight table", caption: "Sector × {avg, %0, %≥70, n} with cell shading.", render: renderHighlightTable, controls: null },
  rose_sector_avg: { title: "Nightingale / rose", caption: "Polar slices; radius = avg BATS. Decorative — use bars to compare.", render: renderRoseSectorAvg, controls: null },
  parallel_coords_dims: { title: "Parallel coordinates", caption: "Seven key dimensions; one line per ticker.", render: renderParallelCoords, controls: null },
};
