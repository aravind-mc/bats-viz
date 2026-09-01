# BATS Visualisation

Analytics for the **BotFlo AI Transformation Score (BATS)** — BotFlo’s rubric that scores how companies talk about AI on earnings calls (15 dimensions, 0–100 total). Data is a snapshot from [score.botflo.com](https://score.botflo.com).

In-browser: DuckDB-Wasm + JSON. **Gallery** of 25 charts (no SQL required); **SQL** tab for read-only queries with chart views that enable only when the result shape fits. Full reports: `https://score.botflo.com/report.html?slug=…`

Data: `/data` (reports, scores, dims). MIT license.

DuckDB-Wasm loads from jsDelivr at runtime (not vendored — Cloudflare Pages caps deploy assets at 25 MiB per file).

## Deploy (Cloudflare Pages)

- **Build command:** leave empty (static site)
- **Output directory:** `/`
- No `vendor/duckdb/` in the repo; WASM is fetched from CDN on first load

## WebMCP

Feature-detect `document.modelContext || navigator.modelContext`. Ten tools in `js/webmcp.js`:

`get_schema` · `set_filters` · `list_charts` · `show_chart` · `select_mark` · `open_report` · `run_sql` · `list_active_views` · `set_sql_view` · `get_result`

```javascript
const modelContext = document.modelContext || navigator.modelContext;
if (modelContext?.registerTool) {
  await modelContext.registerTool({
    name: "list_charts",
    description: "List gallery chart ids and captions.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      return { charts: [{ id: "sector_avg_bar", title: "Sector average bar" }] };
    },
    annotations: { readOnlyHint: true },
  }, { signal: new AbortController().signal });
}
```
