/** @typedef {'table'|'bar'|'heatmap'|'scatter'|'histogram'|'beeswarm'|'box'|'ecdf'|'treemap'|'lollipop'|'rose'|'packed'|'radar'|'parallel'|'highlight'} SqlViewType */

/**
 * @typedef {object} ColumnProfile
 * @property {string} name
 * @property {'numeric'|'text'|'other'} kind
 * @property {number} distinct
 * @property {boolean} isId
 * @property {boolean} isMeasure
 * @property {boolean} isCategory
 */

/**
 * @typedef {object} ViewRecommendation
 * @property {SqlViewType} defaultView
 * @property {Record<SqlViewType, boolean>} enabled
 * @property {Record<SqlViewType, string>} tooltips
 * @property {{ category?: string, category2?: string, measure?: string, measure2?: string, label?: string, measures?: string[] }} mapping
 */

const VIEW_ORDER = /** @type {const} */ ([
  "table", "bar", "lollipop", "rose", "heatmap", "scatter", "histogram", "beeswarm", "box", "ecdf",
  "treemap", "packed", "radar", "parallel", "highlight",
]);

const DISABLED_TIPS = {
  table: "",
  bar: "Need one category column (2–30 values) and one measure per category (aggregated rows).",
  heatmap: "Need two category columns (each ≤20 values) and one numeric measure.",
  scatter: "Need at least two numeric measures and 15+ rows.",
  histogram: "Need one numeric column of raw values (20+ rows), not pre-binned bucket + count.",
  beeswarm: "Need a label column (e.g. ticker) and one numeric measure, 5–80 rows.",
  box: "Need a category column (2–15 groups) and multiple numeric values per group.",
  ecdf: "Need one numeric column (20+ rows) or value + cumulative % columns.",
  treemap: "Need one category (≤30 groups) and one positive numeric measure.",
  lollipop: "Need a category column and a gap/delta measure (one row per category).",
  rose: "Need a category column (3–15 groups) and one average measure.",
  packed: "Need ticker + size measure (+ optional sector color), 15–200 rows.",
  radar: "Need dimension labels and two series (e.g. ticker % vs sector avg %).",
  parallel: "Need ticker + 3+ numeric dimension columns, ≤120 rows.",
  highlight: "Need at least two numeric measures and ≤40 rows.",
};

/** @param {unknown} v */
function isNumeric(v) {
  if (v == null || v === "") return false;
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "bigint") return true;
  return typeof v === "string" && v !== "" && !Number.isNaN(Number(v));
}

/** @param {string[]} columns @param {Record<string, unknown>[]} rows */
function profileColumns(columns, rows) {
  const n = rows.length;
  /** @type {ColumnProfile[]} */
  const profiles = columns.map((name) => {
    const values = rows.map((r) => r[name]);
    const nonNull = values.filter((v) => v != null && v !== "");
    const distinct = new Set(nonNull.map((v) => String(v))).size;
    const numericCount = nonNull.filter(isNumeric).length;
    const kind = numericCount >= nonNull.length * 0.8 && nonNull.length > 0 ? "numeric" : "text";
    const isId = /^(ticker|slug|id)$/i.test(name);
    const isMeasure = kind === "numeric" && !isId
      || /^(avg_|n$|pct_|count|total|sum_)/i.test(name)
      || /^(avg|n|pct|count|total|sum)$/i.test(name);
    const isCategory = kind === "text" && !isId && distinct >= 2 && distinct <= 30;
    return { name, kind, distinct, isId, isMeasure, isCategory };
  });

  // Pre-binned bucket + count → category + measure (bar chart), not two measures (highlight).
  const countCol = profiles.find((p) => p.isMeasure && /^count$|^n$/i.test(p.name));
  if (countCol) {
    for (const p of profiles) {
      if (p.name === countCol.name) continue;
      if (/^bucket$|^bin$|^label$/i.test(p.name) && p.distinct >= 2 && p.distinct <= 30) {
        p.isCategory = true;
        p.isMeasure = false;
      }
    }
  }

  return profiles;
}

/** @param {Record<string, unknown>[]} rows @param {string} catName */
function rowsPerCategory(rows, catName) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const r of rows) {
    const k = String(r[catName]);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

/** @param {string[]} columns @param {Record<string, unknown>[]} rows */
export function recommendView(columns, rows) {
  const profiles = profileColumns(columns, rows);
  const n = rows.length;
  const categories = profiles.filter((p) => p.isCategory);
  const measures = profiles.filter((p) => p.isMeasure);
  const numericMeasures = measures.filter((p) => p.kind === "numeric");

  /** @type {Record<SqlViewType, boolean>} */
  const enabled = {
    table: true,
    bar: false,
    heatmap: false,
    scatter: false,
    histogram: false,
    beeswarm: false,
    box: false,
    ecdf: false,
    treemap: false,
    lollipop: false,
    rose: false,
    packed: false,
    radar: false,
    parallel: false,
    highlight: false,
  };

  /** @type {ViewRecommendation['mapping']} */
  const mapping = {};

  if (n === 0) {
    return { defaultView: "table", enabled, tooltips: DISABLED_TIPS, mapping };
  }

  const idOnly = profiles.every((p) => p.isId || !p.isMeasure) && measures.length >= 2;
  if (n === 1 || idOnly) {
    return { defaultView: "table", enabled, tooltips: DISABLED_TIPS, mapping };
  }

  if (categories.length >= 1 && measures.length >= 1) {
    const allowTickerCat = (c) => c.distinct >= 2 && c.distinct <= 30 && (!/ticker/i.test(c.name) || n <= 30);
    const cat = categories.find((c) => allowTickerCat(c) && !/ticker/i.test(c.name))
      || categories.find((c) => allowTickerCat(c))
      || categories[0];
    if (cat && allowTickerCat(cat)) {
      const counts = rowsPerCategory(rows, cat.name);
      const maxPer = Math.max(...counts.values(), 0);
      if (maxPer <= 1) {
        enabled.bar = true;
        mapping.category = cat.name;
        mapping.measure = measures[0].name;
        if (/sector/i.test(cat.name) && cat.distinct >= 3 && cat.distinct <= 15) {
          enabled.rose = true;
        }
      }
    }
  }

  const gapMeasure = numericMeasures.find((m) => /gap|delta|diff|vs_book/i.test(m.name));
  const lolCat = categories.find((c) => !/ticker/i.test(c.name) && c.distinct >= 2 && c.distinct <= 15);
  if (lolCat && gapMeasure) {
    const maxPer = Math.max(...rowsPerCategory(rows, lolCat.name).values(), 0);
    if (maxPer <= 1) {
      enabled.lollipop = true;
      mapping.category = lolCat.name;
      mapping.measure = gapMeasure.name;
    }
  }

  const packLabel = profiles.find((p) => (p.isId || /ticker/i.test(p.name)) && p.distinct === n);
  const packMeasure = numericMeasures.find((m) => /^(bats|score|value|size|n)$/i.test(m.name))
    || (numericMeasures.length === 1 ? numericMeasures[0] : null);
  const packColor = profiles.find((p) => /sector|category|group/i.test(p.name) && p.kind === "text");
  if (packLabel && packMeasure && n >= 15 && n <= 200) {
    enabled.packed = true;
    mapping.label = packLabel.name;
    mapping.measure = packMeasure.name;
    if (packColor) mapping.category = packColor.name;
  }

  const dimCol = profiles.find((p) => /dim_name|dimension/i.test(p.name) && p.kind === "text");
  const radarSeries = numericMeasures.filter((m) => m.kind === "numeric");
  if (dimCol && radarSeries.length === 2 && n >= 5 && n <= 20) {
    const sectorSeries = radarSeries.find((m) => /sector|avg|bench|baseline/i.test(m.name));
    const tickerSeries = radarSeries.find((m) => m.name !== sectorSeries?.name) || radarSeries[0];
    if (sectorSeries && tickerSeries) {
      enabled.radar = true;
      mapping.category = dimCol.name;
      mapping.measure = tickerSeries.name;
      mapping.measure2 = sectorSeries.name;
    }
  }

  const parLabel = profiles.find((p) => (p.isId || /ticker/i.test(p.name)) && p.distinct === n);
  const parDims = numericMeasures.filter((m) => /^d\d+$/i.test(m.name) || /_pct$|_score$/i.test(m.name));
  const parSector = profiles.find((p) => /sector/i.test(p.name) && p.kind === "text");
  if (parLabel && parDims.length >= 3 && n <= 120) {
    enabled.parallel = true;
    mapping.label = parLabel.name;
    mapping.measures = parDims.map((m) => m.name);
    if (parSector) mapping.category = parSector.name;
  }

  const boxCat = categories.find((c) => c.distinct >= 2 && c.distinct <= 15 && !/ticker/i.test(c.name));
  const boxMeasure = numericMeasures.find((m) => !categories.some((c) => c.name === m.name));
  if (boxCat && boxMeasure) {
    const counts = [...rowsPerCategory(rows, boxCat.name).values()];
    if (counts.length >= 2 && Math.min(...counts) >= 2 && Math.max(...counts) > 1) {
      enabled.box = true;
      mapping.category = boxCat.name;
      mapping.measure = boxMeasure.name;
    }
  }

  const labelCol = profiles.find((p) =>
    (p.isId || /^(ticker|name|label)$/i.test(p.name))
    && p.kind === "text"
    && p.distinct >= 5
    && p.distinct === n);
  if (labelCol && numericMeasures.length === 1 && n >= 5 && n <= 80) {
    enabled.beeswarm = true;
    mapping.label = labelCol.name;
    mapping.measure = numericMeasures[0].name;
  }

  if (categories.length >= 2 && measures.length >= 1) {
    const [c1, c2] = categories.filter((c) => c.distinct <= 20).slice(0, 2);
    if (c1 && c2) {
      enabled.heatmap = true;
      mapping.category = c1.name;
      mapping.category2 = c2.name;
      mapping.measure = measures[0].name;
    }
  }

  if (numericMeasures.length >= 2 && n >= 15) {
    enabled.scatter = true;
    mapping.measures = numericMeasures.slice(0, 4).map((m) => m.name);
  }

  const histMeasure = numericMeasures.find((m) => !m.isCategory);
  const usefulCat = categories.filter((c) => c.distinct > 2 && c.distinct <= 30);
  const singleValueCol = numericMeasures.length === 1 && categories.length === 0;
  if (histMeasure && usefulCat.length === 0 && singleValueCol && n >= 20) {
    enabled.histogram = true;
    if (!mapping.measure) mapping.measure = histMeasure.name;
  }

  const pctCol = profiles.find((p) =>
    p.isMeasure && /pct|cumulative|percent_rank/i.test(p.name) && p.kind === "numeric");
  const ecdfValue = numericMeasures.find((m) => m.name !== pctCol?.name);
  if (pctCol && ecdfValue && numericMeasures.length === 2 && categories.length === 0) {
    enabled.ecdf = true;
    mapping.measure = ecdfValue.name;
    mapping.measure2 = pctCol.name;
  } else if (numericMeasures.length === 1 && categories.length === 0 && n >= 20) {
    enabled.ecdf = true;
    if (!mapping.measure) mapping.measure = numericMeasures[0].name;
  }

  const treemapCat = categories.find((c) => c.distinct <= 30);
  const treemapMeasure = measures.find((m) => {
    const vals = rows.map((r) => Number(r[m.name])).filter((v) => !Number.isNaN(v));
    return vals.length && vals.every((v) => v >= 0);
  });
  if (treemapCat && treemapMeasure && treemapCat.distinct <= 30) {
    const maxPer = Math.max(...rowsPerCategory(rows, treemapCat.name).values(), 0);
    if (maxPer <= 1) enabled.treemap = true;
  }

  if (numericMeasures.length >= 2 && n <= 40) {
    enabled.highlight = true;
  }

  let defaultView = /** @type {SqlViewType} */ ("table");
  if (enabled.bar && !enabled.lollipop) defaultView = "bar";
  else if (enabled.lollipop) defaultView = "lollipop";
  else if (enabled.box) defaultView = "box";
  else if (enabled.beeswarm) defaultView = "beeswarm";
  else if (enabled.packed) defaultView = "packed";
  else if (enabled.parallel) defaultView = "parallel";
  else if (enabled.radar) defaultView = "radar";
  else if (enabled.heatmap) defaultView = "heatmap";
  else if (enabled.scatter) defaultView = "scatter";
  else if (enabled.histogram && !mapping.measure2) defaultView = "histogram";
  else if (enabled.ecdf) defaultView = "ecdf";
  else if (enabled.rose) defaultView = "rose";

  return { defaultView, enabled, tooltips: DISABLED_TIPS, mapping };
}

export { VIEW_ORDER };
