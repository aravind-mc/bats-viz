/** @typedef {{ slug: string, ticker: string, company: string, sector: string, call_date: string, bats: number, sector_ai: number }} TickerRow */
/** @typedef {{ slug: string, dim_id: number, dim_key: string, dim_name: string, score: number, score_max: number }} ScoreRow */
/** @typedef {{ dim_id: number, dim_key: string, dim_name: string }} DimRow */

/** @type {TickerRow[]} */
let allTickers = [];
/** @type {ScoreRow[]} */
let allScores = [];
/** @type {DimRow[]} */
let allDims = [];
/** @type {number[]} */
let parallelDimIds = [];

export const filters = {
  sectors: [],
  minBats: null,
  maxBats: null,
  zerosOnly: false,
};

export const chartState = {
  beeswarmSector: "",
  radarTicker: "",
  waterfallTicker: "",
  dimLeadersId: 5,
};

export async function loadData() {
  const [reportsRes, scoresRes, dimsRes] = await Promise.all([
    fetch("data/reports.json"),
    fetch("data/scores.json"),
    fetch("data/dims.json"),
  ]);
  if (!reportsRes.ok || !scoresRes.ok || !dimsRes.ok) {
    throw new Error("Failed to load data files");
  }
  const [reportsJson, scoresJson, dimsJson] = await Promise.all([
    reportsRes.json(),
    scoresRes.json(),
    dimsRes.json(),
  ]);
  allTickers = reportsJson.reports;
  allScores = scoresJson.scores;
  allDims = dimsJson.dims;
  parallelDimIds = dimsJson.parallel_dim_ids || [1, 2, 3, 5, 8, 11, 15];

  if (!chartState.beeswarmSector && allTickers.length) {
    chartState.beeswarmSector = getAllSectors()[0] || "";
  }
  if (!chartState.radarTicker && allTickers.length) {
    chartState.radarTicker = [...allTickers].sort((a, b) => b.bats - a.bats)[0]?.ticker || "";
  }
  if (!chartState.waterfallTicker) {
    chartState.waterfallTicker = chartState.radarTicker;
  }
  return allTickers;
}

export function getDims() {
  return allDims;
}

export function getAllTickers() {
  return allTickers;
}

export function getAllScores() {
  return allScores;
}

export function getAllSectors() {
  return [...new Set(allTickers.map((r) => r.sector))].sort();
}

/** @returns {TickerRow[]} */
export function getFilteredTickers() {
  return allTickers.filter((r) => {
    if (filters.sectors.length && !filters.sectors.includes(r.sector)) return false;
    if (filters.minBats != null && r.bats < filters.minBats) return false;
    if (filters.maxBats != null && r.bats > filters.maxBats) return false;
    if (filters.zerosOnly && r.bats !== 0) return false;
    return true;
  });
}

/** @param {TickerRow[]} rows */
export function getFilteredScores(rows) {
  const slugs = new Set(rows.map((r) => r.slug));
  return allScores.filter((s) => slugs.has(s.slug));
}

/**
 * @param {TickerRow[]} rows
 * @returns {{ sector: string, n: number, avg_bats: number, pct_zero: number, pct_ge70: number }[]}
 */
export function aggregateBySector(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.sector)) map.set(r.sector, []);
    map.get(r.sector).push(r);
  }
  return [...map.entries()]
    .map(([sector, items]) => ({
      sector,
      n: items.length,
      avg_bats: items.reduce((s, x) => s + x.bats, 0) / items.length,
      pct_zero: (100 * items.filter((x) => x.bats === 0).length) / items.length,
      pct_ge70: (100 * items.filter((x) => x.bats >= 70).length) / items.length,
    }))
    .sort((a, b) => b.avg_bats - a.avg_bats);
}

/** @param {TickerRow[]} rows */
export function batsHistogramBuckets(rows) {
  const buckets = [];
  for (let i = 0; i < 10; i++) {
    const lo = i * 10;
    const hi = i === 9 ? 100 : lo + 9;
    const label = i === 9 ? "90–100" : `${lo}–${hi}`;
    buckets.push({
      bucket: label,
      lo,
      count: rows.filter((r) => r.bats >= lo && r.bats <= hi).length,
    });
  }
  return buckets;
}

/** @param {number[]} values */
export function quartiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  };
  return { min: sorted[0] ?? 0, q1: q(0.25), median: q(0.5), q3: q(0.75), max: sorted[sorted.length - 1] ?? 0 };
}

/**
 * @param {ScoreRow[]} scores
 * @param {TickerRow[]} rows
 */
export function pivotScores(scores, rows) {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  /** @type {Map<string, Record<string, number>>} */
  const map = new Map();
  for (const s of scores) {
    if (!bySlug.has(s.slug)) continue;
    if (!map.has(s.slug)) map.set(s.slug, {});
    map.get(s.slug)[`d${s.dim_id}`] = s.score;
    map.get(s.slug)[s.dim_key] = s.score;
    map.get(s.slug).score_max_d = map.get(s.slug).score_max_d || {};
    map.get(s.slug).score_max_d[s.dim_id] = s.score_max;
  }
  return rows.map((r) => {
    const dims = map.get(r.slug) || {};
    return { ...r, ...dims };
  });
}

/** @param {ReturnType<typeof pivotScores>} pivoted @param {number} dimId */
export function getDimScore(row, dimId) {
  return row[`d${dimId}`] ?? 0;
}

/**
 * @param {ScoreRow[]} scores
 * @param {TickerRow[]} rows
 */
export function sectorDimHeatmapData(scores, rows) {
  const slugs = new Set(rows.map((r) => r.slug));
  const filtered = scores.filter((s) => slugs.has(s.slug));
  const slugSector = new Map(rows.map((r) => [r.slug, r.sector]));
  /** @type {Map<string, { sum: number, max: number, n: number }>} */
  const agg = new Map();
  for (const s of filtered) {
    const sector = slugSector.get(s.slug);
    if (!sector || !s.score_max) continue;
    const key = `${sector}\0${s.dim_id}`;
    if (!agg.has(key)) agg.set(key, { sum: 0, max: 0, n: 0 });
    const a = agg.get(key);
    a.sum += s.score / s.score_max;
    a.n += 1;
  }
  const out = [];
  for (const [key, a] of agg) {
    const [sector, dimId] = key.split("\0");
    const dim = allDims.find((d) => String(d.dim_id) === dimId);
    out.push({
      sector,
      dim_id: Number(dimId),
      dim_name: dim?.dim_name || dimId,
      pct: a.n ? a.sum / a.n : 0,
    });
  }
  return out;
}

/**
 * @param {ScoreRow[]} scores
 * @param {TickerRow[]} rows
 */
export function dimCorrelationMatrix(scores, rows) {
  const pivoted = pivotScores(scores, rows);
  const dimIds = allDims.map((d) => d.dim_id);
  const cols = dimIds.map((id) => `d${id}`);
  const matrix = [];
  for (let i = 0; i < dimIds.length; i++) {
    for (let j = 0; j < dimIds.length; j++) {
      const xi = cols[i];
      const xj = cols[j];
      const pairs = pivoted.filter((r) => r[xi] != null && r[xj] != null);
      const n = pairs.length;
      if (n < 2) {
        matrix.push({ dim_a: dimIds[i], dim_b: dimIds[j], r: 0 });
        continue;
      }
      const xs = pairs.map((p) => p[xi]);
      const ys = pairs.map((p) => p[xj]);
      const mx = xs.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let dx = 0;
      let dy = 0;
      for (let k = 0; k < n; k++) {
        const vx = xs[k] - mx;
        const vy = ys[k] - my;
        num += vx * vy;
        dx += vx * vx;
        dy += vy * vy;
      }
      const r = dx && dy ? num / Math.sqrt(dx * dy) : 0;
      matrix.push({ dim_a: dimIds[i], dim_b: dimIds[j], r });
    }
  }
  return matrix;
}

/** @param {TickerRow[]} rows @param {ScoreRow[]} scores */
export function hypeGapData(rows, scores) {
  const pivoted = pivotScores(scores, rows);
  return pivoted
    .map((r) => ({
      ticker: r.ticker,
      sector: r.sector,
      gap: (r.d3 ?? 0) - (r.d8 ?? 0),
      bats: r.bats,
    }))
    .sort((a, b) => a.gap - b.gap);
}

/** @param {TickerRow[]} rows */
export function ecdfData(rows) {
  const sorted = [...rows].sort((a, b) => a.bats - b.bats);
  return sorted.map((r, i) => ({
    bats: r.bats,
    pct: (100 * (i + 1)) / sorted.length,
    ticker: r.ticker,
  }));
}

/** @param {TickerRow[]} rows */
export function bookAvgBats(rows) {
  return rows.length ? rows.reduce((s, r) => s + r.bats, 0) / rows.length : 0;
}

export function getParallelDimIds() {
  return parallelDimIds;
}

export const CHART_SQL = {
  sector_avg_bar: "SELECT sector, ROUND(AVG(bats), 1) AS avg_bats, COUNT(*) AS n FROM v_tickers GROUP BY sector ORDER BY avg_bats DESC",
  sector_pct_zero: "SELECT sector, ROUND(100.0 * SUM(CASE WHEN bats = 0 THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_zero FROM v_tickers GROUP BY sector",
  sector_pct_ge70: "SELECT sector, ROUND(100.0 * SUM(CASE WHEN bats >= 70 THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_ge70 FROM v_tickers GROUP BY sector",
  bats_histogram: "SELECT FLOOR(bats/10)*10 AS bucket, COUNT(*) AS count FROM v_tickers GROUP BY 1 ORDER BY 1",
  sector_hist_small_multiples: "SELECT sector, bats FROM v_tickers ORDER BY sector, bats",
  sector_box: "SELECT sector, bats FROM v_tickers ORDER BY sector, bats",
  top20_bar: "SELECT ticker, sector, bats FROM v_tickers ORDER BY bats DESC LIMIT 20",
  zeros_list: "SELECT ticker, sector, bats FROM v_tickers WHERE bats = 0 ORDER BY sector, ticker",
  scatter_bats_sector_ai: "SELECT ticker, sector, bats, sector_ai FROM v_tickers",
  scatter_tone_evidence: `SELECT v.ticker, v.sector, v.bats, s3.score AS tone, s8.score AS evidence
FROM v_tickers v
JOIN scores s3 ON s3.slug = v.slug AND s3.dim_id = 3
JOIN scores s8 ON s8.slug = v.slug AND s8.dim_id = 8`,
  quadrant_strategy_execution: `SELECT v.ticker, v.sector, s2.score AS centrality, s11.score AS hype_exec
FROM v_tickers v
JOIN scores s2 ON s2.slug = v.slug AND s2.dim_id = 2
JOIN scores s11 ON s11.slug = v.slug AND s11.dim_id = 11`,
  heatmap_sector_dim: `SELECT v.sector, d.dim_name,
  ROUND(AVG(s.score::DOUBLE / NULLIF(s.score_max, 0)), 3) AS pct_of_max
FROM v_tickers v
JOIN scores s ON s.slug = v.slug
JOIN dims d ON d.dim_id = s.dim_id
GROUP BY v.sector, d.dim_id, d.dim_name
ORDER BY v.sector, d.dim_id`,
  corr_heatmap: `WITH pct AS (
  SELECT v.slug, s.dim_id, s.score::DOUBLE / NULLIF(s.score_max, 0) AS pct
  FROM v_tickers v
  JOIN scores s ON s.slug = v.slug
),
pairs AS (
  SELECT a.dim_id AS dim_a, b.dim_id AS dim_b, CORR(a.pct, b.pct) AS r
  FROM pct a
  JOIN pct b ON a.slug = b.slug
  GROUP BY 1, 2
)
SELECT d1.dim_name AS dim_a, d2.dim_name AS dim_b, ROUND(p.r, 3) AS r
FROM pairs p
JOIN dims d1 ON d1.dim_id = p.dim_a
JOIN dims d2 ON d2.dim_id = p.dim_b
ORDER BY dim_a, dim_b`,
  dim_leaders: `SELECT v.ticker, d.dim_name, s.score
FROM v_tickers v
JOIN scores s ON s.slug = v.slug AND s.dim_id = 5
JOIN dims d ON d.dim_id = s.dim_id
ORDER BY s.score DESC
LIMIT 15`,
  radar_ticker_vs_sector: `SELECT d.dim_name,
  ROUND(100.0 * s.score / NULLIF(s.score_max, 0), 1) AS ticker_pct,
  ROUND(sector_avg.avg_pct, 1) AS sector_avg_pct
FROM v_tickers v
JOIN scores s ON s.slug = v.slug
JOIN dims d ON d.dim_id = s.dim_id
JOIN (
  SELECT v2.sector, s2.dim_id,
    100.0 * AVG(s2.score::DOUBLE / NULLIF(s2.score_max, 0)) AS avg_pct
  FROM v_tickers v2
  JOIN scores s2 ON s2.slug = v2.slug
  GROUP BY v2.sector, s2.dim_id
) sector_avg ON sector_avg.sector = v.sector AND sector_avg.dim_id = s.dim_id
WHERE v.ticker = 'NVDA'
ORDER BY s.dim_id`,
  waterfall_ticker_dims: `SELECT d.dim_name, s.score,
  ROUND(100.0 * s.score / NULLIF(s.score_max, 0), 1) AS pct_of_max
FROM v_tickers v
JOIN scores s ON s.slug = v.slug
JOIN dims d ON d.dim_id = s.dim_id
WHERE v.ticker = 'NVDA'
ORDER BY s.dim_id`,
  diverging_hype_gap: `SELECT v.ticker, v.sector,
  s3.score - s8.score AS gap, s3.score AS tone, s8.score AS evidence
FROM v_tickers v
JOIN scores s3 ON s3.slug = v.slug AND s3.dim_id = 3
JOIN scores s8 ON s8.slug = v.slug AND s8.dim_id = 8
ORDER BY ABS(s3.score - s8.score) DESC
LIMIT 30`,
  treemap_sector_n: "SELECT sector, COUNT(*) AS n FROM v_tickers GROUP BY sector",
  packed_circles_ticker_bats: "SELECT ticker, sector, bats FROM v_tickers ORDER BY bats DESC",
  beeswarm_sector: `SELECT ticker, bats
FROM v_tickers
WHERE sector = 'Information Technology'
ORDER BY bats`,
  lollipop_sector_vs_book_avg: `WITH book AS (SELECT AVG(bats) AS book_avg FROM v_tickers)
SELECT sector,
  ROUND(AVG(bats), 1) AS avg_bats,
  ROUND(AVG(bats) - (SELECT book_avg FROM book), 1) AS gap_vs_book
FROM v_tickers
GROUP BY sector
ORDER BY gap_vs_book DESC`,
  ecdf_bats: `SELECT bats, ROUND(PERCENT_RANK() OVER (ORDER BY bats) * 100, 1) AS pct_at_or_below
FROM v_tickers
ORDER BY bats`,
  highlight_table_sector_kpis: `SELECT sector,
  ROUND(AVG(bats), 1) AS avg_bats,
  ROUND(100.0 * SUM(CASE WHEN bats = 0 THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_zero,
  ROUND(100.0 * SUM(CASE WHEN bats >= 70 THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_ge70,
  COUNT(*) AS n
FROM v_tickers
GROUP BY sector
ORDER BY avg_bats DESC`,
  rose_sector_avg: "SELECT sector, ROUND(AVG(bats), 1) AS avg_bats FROM v_tickers GROUP BY sector ORDER BY avg_bats DESC",
  parallel_coords_dims: `SELECT v.ticker, v.sector,
  MAX(CASE WHEN s.dim_id = 1 THEN ROUND(100.0 * s.score / NULLIF(s.score_max, 0), 0) END) AS d1,
  MAX(CASE WHEN s.dim_id = 2 THEN ROUND(100.0 * s.score / NULLIF(s.score_max, 0), 0) END) AS d2,
  MAX(CASE WHEN s.dim_id = 3 THEN ROUND(100.0 * s.score / NULLIF(s.score_max, 0), 0) END) AS d3,
  MAX(CASE WHEN s.dim_id = 5 THEN ROUND(100.0 * s.score / NULLIF(s.score_max, 0), 0) END) AS d5,
  MAX(CASE WHEN s.dim_id = 8 THEN ROUND(100.0 * s.score / NULLIF(s.score_max, 0), 0) END) AS d8,
  MAX(CASE WHEN s.dim_id = 11 THEN ROUND(100.0 * s.score / NULLIF(s.score_max, 0), 0) END) AS d11,
  MAX(CASE WHEN s.dim_id = 15 THEN ROUND(100.0 * s.score / NULLIF(s.score_max, 0), 0) END) AS d15
FROM v_tickers v
JOIN scores s ON s.slug = v.slug
WHERE s.dim_id IN (1, 2, 3, 5, 8, 11, 15)
GROUP BY v.ticker, v.sector
ORDER BY v.ticker
LIMIT 40`,
  treemap_sector_score_mass: `SELECT sector, SUM(bats) AS score_mass
FROM v_tickers
GROUP BY sector
ORDER BY score_mass DESC`,
};
