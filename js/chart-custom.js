import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import {
  aggregateBySector,
  getFilteredScores,
  getDims,
  getParallelDimIds,
  chartState,
  pivotScores,
} from "./data.js";
import { selectTicker } from "./mark-click.js";

const INK = "#1a1a1a";
const INK_MUTED = "#5c5c5c";
const GRID = "#e8e4dc";
const MEASURE = "#2563eb";
const SECTOR_COLORS = [
  "#4e79a7", "#59a14f", "#f28e2b", "#e15759", "#76b7b2",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac", "#86bcb6",
];

const sectorColorMap = new Map();
function colorForSector(sector) {
  if (!sectorColorMap.has(sector)) {
    sectorColorMap.set(sector, SECTOR_COLORS[sectorColorMap.size % SECTOR_COLORS.length]);
  }
  return sectorColorMap.get(sector);
}

function clearEl(el) {
  el.replaceChildren();
}

function plotWidth(el) {
  return Math.min(900, el.clientWidth || 900);
}

/** @param {HTMLElement} el @param {import("./data.js").TickerRow[]} rows */
export function renderZerosList(el, rows) {
  const zeros = rows.filter((r) => r.bats === 0).sort((a, b) => a.sector.localeCompare(b.sector) || a.ticker.localeCompare(b.ticker));
  const w = plotWidth(el);
  const wrap = document.createElement("div");
  wrap.className = "zeros-list-wrap";
  wrap.style.gridTemplateColumns = w > 600 ? "auto auto" : "1fr";

  const scroll = document.createElement("div");
  scroll.className = "zeros-table-scroll";

  const table = document.createElement("table");
  table.className = "data-table zeros-table";
  table.innerHTML = `<thead><tr><th>Sector</th><th>Ticker</th><th>BATS</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  for (const r of zeros) {
    const tr = document.createElement("tr");
    tr.className = "clickable-row";
    tr.tabIndex = 0;
    tr.title = `Select ${r.ticker}`;
    tr.innerHTML = `<td>${r.sector}</td><td>${r.ticker}</td><td><span class="dot zero"></span> 0</td>`;
    tr.addEventListener("click", () => selectTicker(r));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectTicker(r);
      }
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  scroll.appendChild(table);

  const bySector = d3.group(zeros, (d) => d.sector);
  const sectorCount = bySector.size;
  const maxPerSector = Math.max(...[...bySector.values()].map((items) => items.length), 1);
  const svgWidth = 100 + Math.min(maxPerSector, 12) * 10;
  const svgHeight = sectorCount * 14 + 36;

  const legend = document.createElement("div");
  legend.className = "zeros-legend-scroll";

  const svg = d3.create("svg").attr("width", svgWidth).attr("height", svgHeight);
  const g = svg.append("g").attr("transform", "translate(4,16)");
  let y = 0;
  for (const [sector, items] of bySector) {
    g.append("text").attr("x", 0).attr("y", y).attr("fill", INK_MUTED).attr("font-size", 10).text(sector.slice(0, 14));
    items.forEach((item, i) => {
      g.append("circle")
        .datum(item)
        .attr("cx", 88 + (i % 12) * 10)
        .attr("cy", y - 3)
        .attr("r", 4)
        .attr("fill", colorForSector(sector))
        .style("cursor", "pointer")
        .on("click", (event, d) => {
          event.stopPropagation();
          selectTicker(d);
        })
        .append("title").text(item.ticker);
    });
    y += 14;
  }
  legend.appendChild(svg.node());

  wrap.appendChild(scroll);
  wrap.appendChild(legend);
  clearEl(el);
  el.appendChild(wrap);
}

/** @param {HTMLElement} el @param {import("./data.js").TickerRow[]} rows */
export function renderHighlightTable(el, rows) {
  const data = aggregateBySector(rows);
  const table = document.createElement("table");
  table.className = "data-table highlight-table";
  table.innerHTML = `<thead><tr><th>Sector</th><th>Avg BATS</th><th>% zero</th><th>% ≥70</th><th>n</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  const maxAvg = Math.max(...data.map((d) => d.avg_bats), 1);
  for (const d of data) {
    const tr = document.createElement("tr");
    const cells = [
      { v: d.sector, heat: null },
      { v: d.avg_bats.toFixed(1), heat: d.avg_bats / maxAvg },
      { v: `${d.pct_zero.toFixed(1)}%`, heat: d.pct_zero / 100 },
      { v: `${d.pct_ge70.toFixed(1)}%`, heat: d.pct_ge70 / 100 },
      { v: String(d.n), heat: d.n / Math.max(...data.map((x) => x.n)) },
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c.v;
      if (c.heat != null) {
        const alpha = 0.08 + c.heat * 0.35;
        td.style.background = `rgba(37, 99, 235, ${alpha})`;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  clearEl(el);
  el.appendChild(table);
}

/** @param {HTMLElement} el @param {import("./data.js").TickerRow[]} rows */
export function renderTreemapSectorN(el, rows) {
  const data = aggregateBySector(rows).map((d) => ({ name: d.sector, value: d.n }));
  const w = plotWidth(el);
  const h = 360;
  const root = d3.hierarchy({ children: data }).sum((d) => d.value);
  d3.treemap().size([w, h]).padding(2)(root);

  const svg = d3.create("svg").attr("width", w).attr("height", h);
  const nodes = svg.selectAll("g").data(root.leaves()).join("g")
    .attr("transform", (d) => `translate(${d.x0},${d.y0})`);
  nodes.append("rect")
    .attr("width", (d) => Math.max(0, d.x1 - d.x0))
    .attr("height", (d) => Math.max(0, d.y1 - d.y0))
    .attr("fill", (d) => colorForSector(d.data.name))
    .attr("stroke", "#fff")
    .attr("opacity", 0.85);
  nodes.append("text")
    .attr("x", 4).attr("y", 14)
    .attr("fill", INK)
    .attr("font-size", 11)
    .text((d) => d.data.name);
  nodes.append("text")
    .attr("x", 4).attr("y", 28)
    .attr("fill", INK_MUTED)
    .attr("font-size", 10)
    .text((d) => `n=${d.data.value}`);

  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = "Quirky: tile area = ticker count (score mass, not quality).";
  clearEl(el);
  el.appendChild(svg.node());
  el.appendChild(note);
}

/** @param {HTMLElement} el @param {import("./data.js").TickerRow[]} rows */
export function renderPackedCircles(el, rows) {
  const w = plotWidth(el);
  const h = 400;
  const root = d3.hierarchy({
    children: rows.map((r) => ({
      ticker: r.ticker,
      name: r.ticker,
      value: Math.max(r.bats, 1),
      sector: r.sector,
    })),
  }).sum((d) => d.value);
  d3.pack().size([w, h]).padding(3)(root);

  const svg = d3.create("svg").attr("width", w).attr("height", h).attr("class", "chart-clickable");
  svg.selectAll("circle")
    .data(root.leaves())
    .join("circle")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", (d) => d.r)
    .attr("fill", (d) => colorForSector(d.data.sector))
    .attr("stroke", "#fff")
    .attr("opacity", 0.8)
    .attr("cursor", "pointer")
    .each(function (d) {
      d3.select(this).append("title").text(`${d.data.ticker}`);
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      selectTicker(d.data);
    });
  svg.selectAll("text")
    .data(root.leaves().filter((d) => d.r > 14))
    .join("text")
    .attr("x", (d) => d.x)
    .attr("y", (d) => d.y)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("fill", INK)
    .attr("font-size", 9)
    .style("pointer-events", "none")
    .text((d) => d.data.name);

  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = "Quirky: circle area ∝ BATS score. Click a circle to open the report panel.";
  clearEl(el);
  el.appendChild(svg.node());
  el.appendChild(note);
}

/** @param {HTMLElement} el @param {import("./data.js").TickerRow[]} rows @param {import("./data.js").ScoreRow[]} scores */
export function renderRadarTickerVsSector(el, rows, scores) {
  const ticker = chartState.radarTicker;
  const row = rows.find((r) => r.ticker === ticker) || rows[0];
  if (!row) return;
  const dims = getDims();
  const slugScores = scores.filter((s) => s.slug === row.slug);
  const sectorScores = scores.filter((s) => rows.some((r) => r.slug === s.slug && r.sector === row.sector));
  const sectorAvg = new Map();
  for (const d of dims) {
    const vals = sectorScores.filter((s) => s.dim_id === d.dim_id && s.score_max);
    sectorAvg.set(d.dim_id, vals.length ? vals.reduce((a, s) => a + s.score / s.score_max, 0) / vals.length : 0);
  }

  const w = 420;
  const h = 420;
  const cx = w / 2;
  const cy = h / 2;
  const r = 150;
  const angle = (i, n) => (i / n) * 2 * Math.PI - Math.PI / 2;

  const svg = d3.create("svg").attr("width", w).attr("height", h);
  const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

  for (let level = 0.25; level <= 1; level += 0.25) {
    g.append("circle").attr("r", r * level).attr("fill", "none").attr("stroke", GRID);
  }
  dims.forEach((d, i) => {
    const a = angle(i, dims.length);
    g.append("line").attr("x1", 0).attr("y1", 0)
      .attr("x2", r * Math.cos(a)).attr("y2", r * Math.sin(a))
      .attr("stroke", GRID);
    g.append("text")
      .attr("x", (r + 14) * Math.cos(a))
      .attr("y", (r + 14) * Math.sin(a))
      .attr("text-anchor", "middle")
      .attr("fill", INK_MUTED)
      .attr("font-size", 8)
      .text(d.dim_name.split(" ")[0]);
  });

  const line = d3.lineRadial()
    .angle((_, i) => angle(i, dims.length))
    .radius((v) => r * v)
    .curve(d3.curveLinearClosed);

  const tickerVals = dims.map((d) => {
    const s = slugScores.find((x) => x.dim_id === d.dim_id);
    return s && s.score_max ? s.score / s.score_max : 0;
  });
  const sectorVals = dims.map((d) => sectorAvg.get(d.dim_id) || 0);

  g.append("path").attr("d", line(sectorVals)).attr("fill", "rgba(37,99,235,0.1)").attr("stroke", MEASURE).attr("stroke-width", 1.5);
  g.append("path").attr("d", line(tickerVals)).attr("fill", "rgba(225,87,89,0.15)").attr("stroke", "#e15759").attr("stroke-width", 2);

  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.innerHTML = `<span><i style="background:#e15759"></i>${row.ticker}</span><span><i style="background:${MEASURE}"></i>${row.sector} avg</span>`;
  clearEl(el);
  el.appendChild(svg.node());
  el.appendChild(legend);
  svg.attr("class", "chart-clickable").style("cursor", "pointer").on("click", () => selectTicker(row));
}

/** @param {HTMLElement} el @param {import("./data.js").TickerRow[]} rows @param {import("./data.js").ScoreRow[]} scores */
export function renderWaterfallTickerDims(el, rows, scores) {
  const ticker = chartState.waterfallTicker;
  const row = rows.find((r) => r.ticker === ticker) || rows[0];
  if (!row) return;
  const dims = getDims();
  const slugScores = dims.map((d) => {
    const s = scores.find((x) => x.slug === row.slug && x.dim_id === d.dim_id);
    return { dim_name: d.dim_name, score: s?.score ?? 0 };
  });

  const w = plotWidth(el);
  const h = 320;
  const m = { top: 20, right: 20, bottom: 80, left: 40 };
  const x = d3.scaleBand().domain(slugScores.map((d) => d.dim_name)).range([m.left, w - m.right]).padding(0.2);
  const y = d3.scaleLinear().domain([0, 100]).range([h - m.bottom, m.top]);

  const svg = d3.create("svg").attr("width", w).attr("height", h);
  let cum = 0;
  slugScores.forEach((d) => {
    const y0 = y(cum + d.score);
    const y1 = y(cum);
    svg.append("rect")
      .attr("x", x(d.dim_name))
      .attr("y", y0)
      .attr("width", x.bandwidth())
      .attr("height", Math.max(0, y1 - y0))
      .attr("fill", MEASURE)
      .attr("opacity", 0.85);
    cum += d.score;
  });
  svg.append("line")
    .attr("x1", m.left).attr("x2", w - m.right)
    .attr("y1", y(100)).attr("y2", y(100))
    .attr("stroke", INK).attr("stroke-dasharray", "4,3");
  svg.append("g").attr("transform", `translate(0,${h - m.bottom})`)
    .call(d3.axisBottom(x).tickSize(0))
    .selectAll("text").attr("transform", "rotate(-45)").style("text-anchor", "end").attr("fill", INK_MUTED).attr("font-size", 9);

  clearEl(el);
  el.appendChild(svg.node());
  svg.attr("class", "chart-clickable").style("cursor", "pointer").on("click", () => selectTicker(row));
}

/** @param {HTMLElement} el @param {import("./data.js").TickerRow[]} rows */
export function renderRoseSectorAvg(el, rows) {
  const data = aggregateBySector(rows);
  const w = 400;
  const h = 400;
  const cx = w / 2;
  const cy = h / 2;
  const r = 160;
  const angle = d3.scaleBand().domain(data.map((d) => d.sector)).range([0, 2 * Math.PI]);
  const radius = d3.scaleLinear().domain([0, 100]).range([0, r]);

  const svg = d3.create("svg").attr("width", w).attr("height", h);
  const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
  data.forEach((d) => {
    const a0 = angle(d.sector);
    const a1 = a0 + angle.bandwidth();
    const arcGen = d3.arc().innerRadius(0).outerRadius(radius(d.avg_bats));
    g.append("path")
      .attr("d", arcGen({ startAngle: a0, endAngle: a1 }))
      .attr("fill", colorForSector(d.sector))
      .attr("opacity", 0.8);
  });
  g.selectAll("circle").data([0.25, 0.5, 0.75, 1]).join("circle")
    .attr("r", (v) => r * v).attr("fill", "none").attr("stroke", GRID);

  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = "Decorative polar view — use the bar chart to compare sectors.";
  clearEl(el);
  el.appendChild(svg.node());
  el.appendChild(note);
}

/** @param {HTMLElement} el @param {import("./data.js").TickerRow[]} rows @param {import("./data.js").ScoreRow[]} scores */
export function renderParallelCoords(el, rows, scores) {
  const dimIds = getParallelDimIds();
  const dims = getDims().filter((d) => dimIds.includes(d.dim_id));
  const pivoted = pivotScores(scores, rows).slice(0, 120);

  const w = plotWidth(el);
  const h = 360;
  const m = { top: 20, right: 20, bottom: 30, left: 20 };
  const x = d3.scalePoint().domain(dims.map((d) => d.dim_name)).range([m.left, w - m.right]);
  const yScales = new Map(dims.map((d) => {
    const max = Math.max(...pivoted.map((p) => p[`d${d.dim_id}`] ?? 0), d.dim_id === 5 ? 8 : 9);
    return [d.dim_id, d3.scaleLinear().domain([0, max]).range([h - m.bottom, m.top])];
  }));

  const svg = d3.create("svg").attr("width", w).attr("height", h);
  dims.forEach((d) => {
    svg.append("g").attr("transform", `translate(${x(d.dim_name)},0)`)
      .call(d3.axisLeft(yScales.get(d.dim_id)).ticks(3).tickSize(0))
      .select(".domain").remove();
    svg.append("text").attr("x", x(d.dim_name)).attr("y", h - 8)
      .attr("text-anchor", "middle").attr("fill", INK_MUTED).attr("font-size", 9)
      .text(d.dim_name.split(" ")[0]);
  });

  const line = d3.line();
  pivoted.forEach((row) => {
    const pts = dims.map((d) => [x(d.dim_name), yScales.get(d.dim_id)(row[`d${d.dim_id}`] ?? 0)]);
    svg.append("path")
      .datum(row)
      .attr("d", line(pts))
      .attr("fill", "none")
      .attr("stroke", colorForSector(row.sector))
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("mouseenter", function () {
        d3.select(this).attr("stroke-opacity", 1).attr("stroke-width", 2.5);
      })
      .on("mouseleave", function () {
        d3.select(this).attr("stroke-opacity", 0.4).attr("stroke-width", 1.5);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        selectTicker(d);
      })
      .append("title").text(`${row.ticker} · ${row.sector}`);
  });

  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = "Quirky: 7 key dimensions, one line per ticker (capped at 120). Click a line to open the report panel.";
  clearEl(el);
  el.appendChild(svg.node());
  el.appendChild(note);
}
