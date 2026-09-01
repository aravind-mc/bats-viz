import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { quartiles, getAllTickers } from "./data.js";
import { selectTicker } from "./mark-click.js";

const INK = "#1a1a1a";
const INK_MUTED = "#5c5c5c";
const GRID = "#e8e4dc";
const MEASURE = "#2563eb";
const PLOT_BG = "#ffffff";
const SECTOR_COLORS = [
  "#4e79a7", "#59a14f", "#f28e2b", "#e15759", "#76b7b2",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac", "#86bcb6",
];
const sectorColorMap = new Map();

/** @param {string} sector */
function colorForSector(sector) {
  if (!sectorColorMap.has(sector)) {
    sectorColorMap.set(sector, SECTOR_COLORS[sectorColorMap.size % SECTOR_COLORS.length]);
  }
  return sectorColorMap.get(sector);
}

/** @param {number[]} vals */
function normalizeRadar(vals) {
  const max = Math.max(...vals, 0);
  return max > 1.5 ? vals.map((v) => v / 100) : vals;
}

/**
 * Resolve a ticker from a SQL result row (column may be ticker or an alias like category).
 * @param {string[]} columns
 * @param {Record<string, unknown>} row
 */
function tickerFromRow(columns, row) {
  const tickerCol = columns.find((c) => /^ticker$/i.test(c));
  if (tickerCol && typeof row[tickerCol] === "string" && row[tickerCol]) {
    return /** @type {string} */ (row[tickerCol]);
  }
  const known = new Set(getAllTickers().map((r) => r.ticker.toUpperCase()));
  for (const c of columns) {
    const v = row[c];
    if (typeof v === "string" && known.has(v.toUpperCase())) return v;
  }
  return null;
}

/**
 * @param {HTMLElement} el
 * @param {string[]} columns
 * @param {Record<string, unknown>[]} rows
 */
export function renderResultTable(el, columns, rows) {
  const table = document.createElement("table");
  table.className = "data-table sql-result-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = columns.map((c) => `<td>${formatCell(row[c])}</td>`).join("");
    const ticker = tickerFromRow(columns, row);
    if (ticker) {
      tr.className = "clickable-row";
      tr.tabIndex = 0;
      tr.title = `Select ${ticker}`;
      tr.addEventListener("click", () => selectTicker({ ticker }));
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectTicker({ ticker });
        }
      });
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  el.replaceChildren(table);
}

/** @param {unknown} v */
function formatCell(v) {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

function plotWidth(el) {
  return Math.min(900, el.clientWidth || 900);
}

/**
 * @param {HTMLElement} el
 * @param {import('./sql-recommender.js').SqlViewType} view
 * @param {string[]} columns
 * @param {Record<string, unknown>[]} rows
 * @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping
 */
export function renderSqlChart(el, view, columns, rows, mapping) {
  el.replaceChildren();
  if (!rows.length && view !== "table") {
    el.innerHTML = `<p class="chart-note">No rows to chart.</p>`;
    return;
  }

  switch (view) {
    case "table":
      renderResultTable(el, columns, rows);
      return;
    case "bar":
      renderBar(el, rows, mapping);
      return;
    case "heatmap":
      renderHeatmap(el, rows, mapping);
      return;
    case "scatter":
      renderScatter(el, rows, mapping);
      return;
    case "histogram":
      renderHistogram(el, rows, mapping);
      return;
    case "beeswarm":
      renderBeeswarm(el, rows, mapping);
      return;
    case "box":
      renderBox(el, rows, mapping);
      return;
    case "ecdf":
      renderEcdf(el, rows, mapping);
      return;
    case "treemap":
      renderTreemap(el, rows, mapping);
      return;
    case "lollipop":
      renderLollipop(el, rows, mapping);
      return;
    case "rose":
      renderRose(el, rows, mapping);
      return;
    case "packed":
      renderPacked(el, rows, mapping);
      return;
    case "radar":
      renderRadar(el, rows, mapping);
      return;
    case "parallel":
      renderParallel(el, rows, mapping);
      return;
    case "highlight":
      renderHighlight(el, columns, rows);
      return;
    default:
      renderResultTable(el, columns, rows);
  }
}

function basePlot() {
  return {
    style: { background: PLOT_BG, color: INK_MUTED, fontFamily: "system-ui, sans-serif" },
  };
}

function axis() {
  return { tickColor: GRID, grid: true, gridColor: GRID, labelColor: INK_MUTED };
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderBar(el, rows, mapping) {
  const cat = mapping.category;
  const measure = mapping.measure;
  if (!cat || !measure) return;
  const data = rows.map((r) => ({ category: String(r[cat]), value: Number(r[measure]) }));
  el.appendChild(Plot.plot({
    ...basePlot(),
    width: plotWidth(el),
    height: Math.max(260, new Set(data.map((d) => d.category)).size * 24),
    marginLeft: 120,
    x: { label: measure, ...axis() },
    y: { label: null, domain: [...new Set(data.map((d) => d.category))] },
    marks: [
      Plot.barX(data, { x: "value", y: "category", fill: MEASURE, tip: true }),
      Plot.text(data, { x: "value", y: "category", text: (d) => String(d.value), dx: 4, textAnchor: "start", fill: INK, fontSize: 10 }),
    ],
  }));
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderHeatmap(el, rows, mapping) {
  const x = mapping.category;
  const y = mapping.category2;
  const fill = mapping.measure;
  if (!x || !y || !fill) return;
  const data = rows.map((r) => ({ x: String(r[x]), y: String(r[y]), v: Number(r[fill]) }));
  const xDom = [...new Set(data.map((d) => d.x))];
  const yDom = [...new Set(data.map((d) => d.y))];
  el.appendChild(Plot.plot({
    ...basePlot(),
    width: plotWidth(el),
    height: Math.max(280, yDom.length * 22 + 80),
    marginLeft: 100,
    marginBottom: 80,
    x: { label: x, domain: xDom, tickRotate: -45 },
    y: { label: y, domain: yDom },
    color: { type: "linear", scheme: "blues", label: fill },
    marks: [Plot.cell(data, { x: "x", y: "y", fill: "v", tip: true })],
  }));
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderScatter(el, rows, mapping) {
  const ms = mapping.measures || [];
  if (ms.length < 2) return;
  const [xKey, yKey] = ms;
  const data = rows.map((r) => ({ x: Number(r[xKey]), y: Number(r[yKey]) }));
  el.appendChild(Plot.plot({
    ...basePlot(),
    width: plotWidth(el),
    height: 360,
    x: { label: xKey, ...axis() },
    y: { label: yKey, ...axis() },
    marks: [Plot.dot(data, { x: "x", y: "y", fill: MEASURE, r: 3, fillOpacity: 0.65, tip: true })],
  }));
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderHistogram(el, rows, mapping) {
  const measure = mapping.measure;
  if (!measure) return;
  const data = rows.map((r) => ({ v: Number(r[measure]) })).filter((d) => !Number.isNaN(d.v));
  el.appendChild(Plot.plot({
    ...basePlot(),
    width: plotWidth(el),
    height: 300,
    x: { label: measure, ...axis() },
    y: { label: "Count", ...axis() },
    marks: [Plot.rectY(data, Plot.binX({ y: "count" }, { x: "v", thresholds: 20 }), { fill: MEASURE })],
  }));
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderBeeswarm(el, rows, mapping) {
  const label = mapping.label || mapping.category;
  const measure = mapping.measure;
  if (!measure) return;
  const data = rows.map((r) => ({
    label: label ? String(r[label]) : "",
    value: Number(r[measure]),
  })).filter((d) => !Number.isNaN(d.value));
  const title = label ? (d) => `${d.label}: ${d.value}` : (d) => String(d.value);
  el.appendChild(Plot.plot({
    ...basePlot(),
    width: plotWidth(el),
    height: 120,
    marginLeft: 40,
    x: { label: measure, ...axis() },
    y: { label: null, domain: [0, 1] },
    marks: [
      Plot.dot(data, Plot.dodgeY({
        x: "value", y: () => 0.5, fill: MEASURE, r: 5, tip: true, title,
      })),
    ],
  }));
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderBox(el, rows, mapping) {
  const cat = mapping.category;
  const measure = mapping.measure;
  if (!cat || !measure) return;
  const groups = [...new Set(rows.map((r) => String(r[cat])))].sort();
  const boxData = groups.map((group) => {
    const vals = rows.filter((r) => String(r[cat]) === group).map((r) => Number(r[measure])).filter((v) => !Number.isNaN(v));
    return { group, ...quartiles(vals), n: vals.length };
  });
  const marks = [
    Plot.ruleX(boxData, { x1: "min", x2: "max", y: "group", stroke: INK_MUTED, strokeWidth: 1 }),
    Plot.ruleX(boxData, { x1: "q1", x2: "q3", y: "group", stroke: MEASURE, strokeWidth: 6, strokeLinecap: "round" }),
    Plot.dot(boxData, { x: "median", y: "group", fill: INK, r: 4 }),
  ];
  const overlay = rows.filter((r) => {
    const n = rows.filter((x) => String(x[cat]) === String(r[cat])).length;
    return n <= 25;
  });
  if (overlay.length) {
    marks.push(Plot.dot(overlay, Plot.dodgeY({
      x: (d) => Number(d[measure]), y: (d) => String(d[cat]), fill: MEASURE, r: 2.5, fillOpacity: 0.45,
    })));
  }
  el.appendChild(Plot.plot({
    ...basePlot(),
    width: plotWidth(el),
    height: Math.max(280, groups.length * 28),
    marginLeft: 150,
    x: { label: measure, ...axis() },
    y: { label: cat, tickColor: GRID, labelColor: INK_MUTED },
    marks,
  }));
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderEcdf(el, rows, mapping) {
  const measure = mapping.measure;
  if (!measure) return;
  const pctKey = mapping.measure2;
  const data = pctKey
    ? rows.map((r) => ({ x: Number(r[measure]), pct: Number(r[pctKey]) }))
      .filter((d) => !Number.isNaN(d.x) && !Number.isNaN(d.pct))
      .sort((a, b) => a.x - b.x)
    : [...rows]
      .map((r) => Number(r[measure]))
      .filter((v) => !Number.isNaN(v))
      .sort((a, b) => a - b)
      .map((x, i, arr) => ({ x, pct: (100 * (i + 1)) / arr.length }));
  el.appendChild(Plot.plot({
    ...basePlot(),
    width: plotWidth(el),
    height: 320,
    x: { label: measure, ...axis() },
    y: { label: "% at or below", domain: [0, 100], tickFormat: (d) => `${d}%`, ...axis() },
    marks: [
      Plot.line(data, { x: "x", y: "pct", stroke: MEASURE, strokeWidth: 2 }),
      Plot.dot(data.filter((_, i) => i % 30 === 0), { x: "x", y: "pct", fill: MEASURE, r: 2 }),
    ],
  }));
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderTreemap(el, rows, mapping) {
  const cat = mapping.category;
  const measure = mapping.measure;
  if (!cat || !measure) return;
  const data = rows.map((r) => ({ name: String(r[cat]), value: Math.max(Number(r[measure]) || 0, 0.001) }));
  const w = plotWidth(el);
  const h = 340;
  const root = d3.hierarchy({ children: data }).sum((d) => d.value);
  d3.treemap().size([w, h]).padding(2)(root);
  const svg = d3.create("svg").attr("width", w).attr("height", h);
  const nodes = svg.selectAll("g").data(root.leaves()).join("g")
    .attr("transform", (d) => `translate(${d.x0},${d.y0})`);
  nodes.append("rect")
    .attr("width", (d) => Math.max(0, d.x1 - d.x0))
    .attr("height", (d) => Math.max(0, d.y1 - d.y0))
    .attr("fill", MEASURE)
    .attr("opacity", 0.75)
    .attr("stroke", "#fff");
  nodes.filter((d) => (d.x1 - d.x0) > 40 && (d.y1 - d.y0) > 20)
    .append("text")
    .attr("x", 4).attr("y", 14)
    .attr("fill", INK)
    .attr("font-size", 10)
    .text((d) => d.data.name);
  el.appendChild(svg.node());
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderLollipop(el, rows, mapping) {
  const cat = mapping.category;
  const measure = mapping.measure;
  if (!cat || !measure) return;
  const data = rows.map((r) => ({
    category: String(r[cat]),
    gap: Number(r[measure]),
  })).filter((d) => !Number.isNaN(d.gap));
  el.appendChild(Plot.plot({
    ...basePlot(),
    width: plotWidth(el),
    height: Math.max(280, data.length * 28),
    marginLeft: 150,
    x: { label: measure, ...axis() },
    y: { label: null, domain: data.map((d) => d.category) },
    marks: [
      Plot.ruleX([0], { stroke: INK_MUTED, strokeDasharray: "4,4" }),
      Plot.ruleX(data, { x1: 0, x2: "gap", y: "category", stroke: MEASURE, strokeWidth: 2 }),
      Plot.dot(data, { x: "gap", y: "category", fill: (d) => colorForSector(d.category), r: 5, tip: true }),
      Plot.text(data, {
        x: "gap", y: "category",
        text: (d) => `${d.gap >= 0 ? "+" : ""}${d.gap.toFixed(1)}`,
        dx: 8, textAnchor: "start", fill: INK, fontSize: 10,
      }),
    ],
  }));
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderRose(el, rows, mapping) {
  const cat = mapping.category;
  const measure = mapping.measure;
  if (!cat || !measure) return;
  const data = rows.map((r) => ({
    name: String(r[cat]),
    value: Number(r[measure]),
  })).filter((d) => !Number.isNaN(d.value));
  const w = 400;
  const h = 400;
  const cx = w / 2;
  const cy = h / 2;
  const r = 160;
  const angle = d3.scaleBand().domain(data.map((d) => d.name)).range([0, 2 * Math.PI]);
  const radius = d3.scaleLinear().domain([0, 100]).range([0, r]);
  const svg = d3.create("svg").attr("width", w).attr("height", h);
  const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
  data.forEach((d) => {
    const a0 = angle(d.name);
    const a1 = a0 + angle.bandwidth();
    const arcGen = d3.arc().innerRadius(0).outerRadius(radius(d.value));
    g.append("path")
      .attr("d", arcGen({ startAngle: a0, endAngle: a1 }))
      .attr("fill", colorForSector(d.name))
      .attr("opacity", 0.8);
  });
  g.selectAll("circle").data([0.25, 0.5, 0.75, 1]).join("circle")
    .attr("r", (v) => r * v).attr("fill", "none").attr("stroke", GRID);
  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = "Decorative polar view — use Bar or Lollipop to compare precisely.";
  el.appendChild(svg.node());
  el.appendChild(note);
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderPacked(el, rows, mapping) {
  const label = mapping.label;
  const measure = mapping.measure;
  const colorKey = mapping.category;
  if (!label || !measure) return;
  const w = plotWidth(el);
  const h = 400;
  const children = rows.map((r) => ({
    name: String(r[label]),
    value: Math.max(Number(r[measure]) || 0, 1),
    group: colorKey ? String(r[colorKey]) : "all",
  }));
  const root = d3.hierarchy({ children }).sum((d) => d.value);
  d3.pack().size([w, h]).padding(3)(root);
  const svg = d3.create("svg").attr("width", w).attr("height", h);
  svg.selectAll("circle")
    .data(root.leaves())
    .join("circle")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", (d) => d.r)
    .attr("fill", (d) => colorForSector(d.data.group))
    .attr("stroke", "#fff")
    .attr("opacity", 0.8);
  svg.selectAll("text")
    .data(root.leaves().filter((d) => d.r > 14))
    .join("text")
    .attr("x", (d) => d.x)
    .attr("y", (d) => d.y)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("fill", INK)
    .attr("font-size", 9)
    .text((d) => d.data.name);
  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = "Circle area ∝ measure value.";
  el.appendChild(svg.node());
  el.appendChild(note);
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderRadar(el, rows, mapping) {
  const cat = mapping.category;
  const s1 = mapping.measure;
  const s2 = mapping.measure2;
  if (!cat || !s1 || !s2) return;
  const labels = rows.map((r) => String(r[cat]));
  const n = labels.length;
  const tickerVals = normalizeRadar(rows.map((r) => Number(r[s1])));
  const sectorVals = normalizeRadar(rows.map((r) => Number(r[s2])));
  const w = 420;
  const h = 420;
  const cx = w / 2;
  const cy = h / 2;
  const r = 150;
  const angle = (i) => (i / n) * 2 * Math.PI - Math.PI / 2;
  const svg = d3.create("svg").attr("width", w).attr("height", h);
  const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
  for (let level = 0.25; level <= 1; level += 0.25) {
    g.append("circle").attr("r", r * level).attr("fill", "none").attr("stroke", GRID);
  }
  labels.forEach((label, i) => {
    const a = angle(i);
    g.append("line").attr("x1", 0).attr("y1", 0)
      .attr("x2", r * Math.cos(a)).attr("y2", r * Math.sin(a))
      .attr("stroke", GRID);
    g.append("text")
      .attr("x", (r + 14) * Math.cos(a))
      .attr("y", (r + 14) * Math.sin(a))
      .attr("text-anchor", "middle")
      .attr("fill", INK_MUTED)
      .attr("font-size", 8)
      .text(label.split(" ")[0]);
  });
  const line = d3.lineRadial()
    .angle((_, i) => angle(i))
    .radius((v) => r * v)
    .curve(d3.curveLinearClosed);
  g.append("path").attr("d", line(sectorVals)).attr("fill", "rgba(37,99,235,0.1)").attr("stroke", MEASURE).attr("stroke-width", 1.5);
  g.append("path").attr("d", line(tickerVals)).attr("fill", "rgba(225,87,89,0.15)").attr("stroke", "#e15759").attr("stroke-width", 2);
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.innerHTML = `<span><i style="background:#e15759"></i>${s1}</span><span><i style="background:${MEASURE}"></i>${s2}</span>`;
  el.appendChild(svg.node());
  el.appendChild(legend);
}

/** @param {Record<string, unknown>[]} rows @param {import('./sql-recommender.js').ViewRecommendation['mapping']} mapping */
function renderParallel(el, rows, mapping) {
  const dims = mapping.measures || [];
  const colorKey = mapping.category;
  if (dims.length < 3) return;
  const w = plotWidth(el);
  const h = 360;
  const m = { top: 20, right: 20, bottom: 30, left: 20 };
  const x = d3.scalePoint().domain(dims).range([m.left, w - m.right]);
  const yScales = new Map(dims.map((dim) => {
    const max = Math.max(...rows.map((r) => Number(r[dim]) || 0), 1);
    return [dim, d3.scaleLinear().domain([0, max]).range([h - m.bottom, m.top])];
  }));
  const svg = d3.create("svg").attr("width", w).attr("height", h);
  dims.forEach((dim) => {
    svg.append("g").attr("transform", `translate(${x(dim)},0)`)
      .call(d3.axisLeft(yScales.get(dim)).ticks(3).tickSize(0))
      .select(".domain").remove();
    svg.append("text").attr("x", x(dim)).attr("y", h - 8)
      .attr("text-anchor", "middle").attr("fill", INK_MUTED).attr("font-size", 9)
      .text(dim);
  });
  const line = d3.line();
  rows.forEach((row) => {
    const pts = dims.map((dim) => [x(dim), yScales.get(dim)(Number(row[dim]) || 0)]);
    const group = colorKey ? String(row[colorKey]) : "all";
    svg.append("path")
      .attr("d", line(pts))
      .attr("fill", "none")
      .attr("stroke", colorForSector(group))
      .attr("stroke-opacity", 0.35)
      .attr("stroke-width", 1);
  });
  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = `${rows.length} series across ${dims.length} dimensions.`;
  el.appendChild(svg.node());
  el.appendChild(note);
}

/** @param {string[]} columns @param {Record<string, unknown>[]} rows */
function renderHighlight(el, columns, rows) {
  const numericCols = columns.filter((c) => rows.some((r) => typeof r[c] === "number"));
  const table = document.createElement("table");
  table.className = "data-table highlight-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  const maxByCol = Object.fromEntries(numericCols.map((c) => {
    const vals = rows.map((r) => Number(r[c])).filter((v) => !Number.isNaN(v));
    return [c, Math.max(...vals, 1)];
  }));
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const c of columns) {
      const td = document.createElement("td");
      td.textContent = formatCell(row[c]);
      if (numericCols.includes(c)) {
        const v = Number(row[c]);
        if (!Number.isNaN(v)) {
          td.style.background = `rgba(37, 99, 235, ${0.08 + (v / maxByCol[c]) * 0.35})`;
        }
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  el.appendChild(table);
}
