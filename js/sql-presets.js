import { CHART_SQL } from "./data.js";

/** @typedef {import('./sql-recommender.js').SqlViewType} SqlViewType */

/**
 * @typedef {object} SqlPreset
 * @property {string} label
 * @property {string} sql
 */

/**
 * @typedef {object} SqlPresetGroup
 * @property {SqlViewType} view
 * @property {string} label
 * @property {SqlPreset[]} presets
 */

/** @type {SqlPresetGroup[]} */
export const SQL_PRESET_GROUPS = [
  {
    view: "table",
    label: "Table",
    presets: [
      { label: "Describe v_tickers", sql: "DESCRIBE v_tickers" },
      { label: "List tables", sql: "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'main' ORDER BY 1" },
      { label: "Sample tickers", sql: "SELECT ticker, sector, bats, sector_ai FROM v_tickers ORDER BY bats DESC LIMIT 10" },
      { label: "Bottom / zeros list", sql: CHART_SQL.zeros_list },
      { label: "Small-multiple histograms", sql: CHART_SQL.sector_hist_small_multiples },
    ],
  },
  {
    view: "bar",
    label: "Bar",
    presets: [
      { label: "Sector average BATS", sql: CHART_SQL.sector_avg_bar },
      { label: "Silent sectors (% zero)", sql: CHART_SQL.sector_pct_zero },
      { label: "High-score share (% ≥70)", sql: CHART_SQL.sector_pct_ge70 },
      { label: "Top 20 tickers", sql: CHART_SQL.top20_bar },
      { label: "BATS buckets", sql: CHART_SQL.bats_histogram },
      { label: "Dimension leaders", sql: CHART_SQL.dim_leaders },
      { label: "Diverging hype gap", sql: CHART_SQL.diverging_hype_gap },
      { label: "Waterfall (NVDA)", sql: CHART_SQL.waterfall_ticker_dims },
    ],
  },
  {
    view: "lollipop",
    label: "Lollipop",
    presets: [
      { label: "Lollipop sector gap", sql: CHART_SQL.lollipop_sector_vs_book_avg },
    ],
  },
  {
    view: "rose",
    label: "Rose",
    presets: [
      { label: "Nightingale / rose", sql: CHART_SQL.rose_sector_avg },
    ],
  },
  {
    view: "heatmap",
    label: "Heatmap",
    presets: [
      { label: "Sector × dimension", sql: CHART_SQL.heatmap_sector_dim },
      { label: "Dimension correlation", sql: CHART_SQL.corr_heatmap },
    ],
  },
  {
    view: "scatter",
    label: "Scatter",
    presets: [
      { label: "BATS vs sector AI", sql: CHART_SQL.scatter_bats_sector_ai },
      { label: "Tone vs evidence", sql: CHART_SQL.scatter_tone_evidence },
      { label: "Centrality vs hype/execution", sql: CHART_SQL.quadrant_strategy_execution },
    ],
  },
  {
    view: "histogram",
    label: "Histogram",
    presets: [
      { label: "BATS distribution", sql: "SELECT bats FROM v_tickers ORDER BY bats" },
    ],
  },
  {
    view: "beeswarm",
    label: "Beeswarm",
    presets: [
      { label: "Beeswarm (IT sector)", sql: CHART_SQL.beeswarm_sector },
    ],
  },
  {
    view: "box",
    label: "Box",
    presets: [
      { label: "Sector box / band", sql: CHART_SQL.sector_box },
    ],
  },
  {
    view: "ecdf",
    label: "ECDF",
    presets: [
      { label: "BATS ECDF", sql: CHART_SQL.ecdf_bats },
    ],
  },
  {
    view: "treemap",
    label: "Treemap",
    presets: [
      { label: "Sector tile size (n)", sql: CHART_SQL.treemap_sector_n },
      { label: "Sector score mass", sql: CHART_SQL.treemap_sector_score_mass },
    ],
  },
  {
    view: "packed",
    label: "Packed",
    presets: [
      { label: "Packed circles", sql: CHART_SQL.packed_circles_ticker_bats },
    ],
  },
  {
    view: "radar",
    label: "Radar",
    presets: [
      { label: "Radar vs sector (NVDA)", sql: CHART_SQL.radar_ticker_vs_sector },
    ],
  },
  {
    view: "parallel",
    label: "Parallel",
    presets: [
      { label: "Parallel coordinates", sql: CHART_SQL.parallel_coords_dims },
    ],
  },
  {
    view: "highlight",
    label: "Highlight",
    presets: [
      { label: "Sector KPI table", sql: CHART_SQL.highlight_table_sector_kpis },
      { label: "Zeros by sector", sql: `SELECT sector,
  COUNT(*) AS n,
  SUM(CASE WHEN bats = 0 THEN 1 ELSE 0 END) AS zeros,
  ROUND(AVG(bats), 1) AS avg_bats
FROM v_tickers
GROUP BY sector
ORDER BY zeros DESC` },
    ],
  },
];

export function getSqlPresetGroups() {
  return SQL_PRESET_GROUPS;
}
