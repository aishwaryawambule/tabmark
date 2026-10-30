// The public results: one row per device, browser, engine and memory format, with the
// median of every run behind it. Filter, sort, and pick up to three rows to compare.

import { tableRows, type TableRow } from "../core/aggregate";
import { engineName, fmtSpeed, kvName } from "../core/format";
import { arrow, h } from "./dom";

type SortKey = "decodeTps" | "prefillTps" | "device" | "runs";
const KINDS: [string, string][] = [["all", "All devices"], ["phone", "Phones"], ["tablet", "Tablets"], ["computer", "Computers"]];
const ENGINES: [string, string][] = [["all", "All engines"], ["webllm", "WebLLM"], ["wllama", "wllama"]];
const MAX_COMPARE = 3;

export function renderResults(root: HTMLElement) {
  const page = h("div", { class: "page wide stack" });
  root.append(page);
  page.append(
    h("h1", {}, "Results"),
    h("p", { class: "lead" }, "Speeds from people who ran the test on their own phones and computers. Each row is the median of every run from the same device and browser, with the same engine and memory format."));
  const body = h("div", { class: "stack" });
  page.append(body);

  let rows: TableRow[] = [];
  let kind = "all";
  let engine = "all";
  let query = "";
  let sort: { key: SortKey; dir: 1 | -1 } = { key: "decodeTps", dir: -1 };
  const selected = new Set<string>();

  const search = h("input", { class: "field", type: "search", "aria-label": "Find a device", placeholder: "Find a device or graphics chip" });
  const count = h("span", { class: "count num", "aria-live": "polite" });
  const chips = (list: [string, string][], get: () => string, set: (v: string) => void) =>
    list.map(([value, label]) => {
      const b = h("button", { class: "chip", type: "button", "aria-pressed": String(get() === value) }, label);
      b.addEventListener("click", () => {
        set(value);
        for (const c of b.parentElement!.querySelectorAll<HTMLButtonElement>(`[data-group="${list[0][1]}"]`)) c.setAttribute("aria-pressed", String(c === b));
        draw();
      });
      b.dataset.group = list[0][1];
      return b;
    });
  search.addEventListener("input", () => { query = search.value.trim().toLowerCase(); draw(); });
  const toolbar = h("div", { class: "toolbar", role: "search" }, search,
    chips(KINDS, () => kind, (v) => (kind = v)), h("span", { class: "gap" }),
    chips(ENGINES, () => engine, (v) => (engine = v)), count);

  const tbody = h("tbody");
  const head = h("tr", {}, h("th", { class: "chk", scope: "col" }, h("span", { class: "sr" }, "")),
    sortHead("Device", "device"), h("th", { scope: "col", class: "wide-only" }, "Browser"), h("th", { scope: "col", class: "wide-only" }, "Graphics"),
    h("th", { scope: "col" }, "Engine"), h("th", { scope: "col" }, "Memory"),
    sortHead("Writing, tok/s", "decodeTps", true), sortHead("Reading, tok/s", "prefillTps", true, true), sortHead("Runs", "runs", true, true));
  const table = h("div", { class: "table-wrap", tabindex: 0, "aria-label": "Results table, scrolls" },
    h("table", { class: "data", "aria-label": "Results" }, h("thead", {}, head), tbody));
  const emptyMatch = h("p", { class: "muted", hidden: true }, "No rows match. Clear the search or pick another filter.");
  const compareSlot = h("div");
  const selCount = h("span", { class: "num" });
  const compareBtn = h("button", { class: "go", type: "button" }, "Compare");
  const clearBtn = h("button", { class: "clear", type: "button", "aria-label": "Clear selection" }, "Clear");
  const selbar = h("div", { class: "selbar", role: "region", "aria-label": "Selection", "aria-live": "polite", "aria-hidden": "true" }, selCount, compareBtn, clearBtn);
  compareBtn.addEventListener("click", () => { drawCompare(); compareSlot.scrollIntoView({ behavior: "smooth", block: "start" }); });
  clearBtn.addEventListener("click", () => { selected.clear(); draw(); compareSlot.replaceChildren(); });
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && selected.size && !root.hidden) { selected.clear(); draw(); } };
  document.addEventListener("keydown", onKey);

  function sortHead(label: string, key: SortKey, right = false, wideOnly = false) {
    const th = h("th", { scope: "col", class: [right ? "r" : "", wideOnly ? "wide-only" : ""].join(" ").trim() || undefined }, h("button", { type: "button" }, label, arrow()));
    th.dataset.key = key;
    th.querySelector("button")!.addEventListener("click", () => {
      sort = sort.key === key ? { key, dir: (sort.dir * -1) as 1 | -1 } : { key, dir: key === "device" ? 1 : -1 };
      draw();
    });
    return th;
  }

  function visible(): TableRow[] {
    return rows
      .filter((r) => (kind === "all" || r.kind === kind) && (engine === "all" || r.engine === engine))
      .filter((r) => !query || `${r.device} ${r.gpu} ${r.os} ${r.browser}`.toLowerCase().includes(query))
      .sort((a, b) => {
        const x = a[sort.key] ?? -1;
        const y = b[sort.key] ?? -1;
        return (typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number)) * sort.dir;
      });
  }

  function draw() {
    const list = visible();
    count.textContent = `${list.length} ${list.length === 1 ? "row" : "rows"}`;
    for (const th of head.querySelectorAll<HTMLElement>("th[data-key]")) {
      if (th.dataset.key === sort.key) th.setAttribute("aria-sort", sort.dir === 1 ? "ascending" : "descending");
      else th.removeAttribute("aria-sort");
    }
    tbody.replaceChildren(...list.map(rowEl));
    emptyMatch.hidden = list.length > 0;
    table.hidden = list.length === 0;
    drawSelection();
  }

  // Only the selection bar changes when a box is ticked: rebuilding the table would
  // move keyboard focus off the checkbox the person just pressed.
  function drawSelection() {
    selCount.textContent = `${selected.size} selected`;
    compareBtn.disabled = selected.size < 2;
    const on = selected.size > 0;
    selbar.classList.toggle("on", on);
    selbar.setAttribute("aria-hidden", String(!on));
    selbar.inert = !on;
  }

  function rowEl(r: TableRow) {
    const box = h("input", { type: "checkbox", "aria-label": `Select ${r.device}, ${engineName(r.engine)}, ${kvName(r.kv)}`, checked: selected.has(r.key) });
    box.addEventListener("change", () => {
      if (box.checked && selected.size >= MAX_COMPARE) { box.checked = false; return; }
      if (box.checked) selected.add(r.key); else selected.delete(r.key);
      tr.setAttribute("aria-selected", String(box.checked));
      drawSelection();
    });
    const tr = h("tr", { "aria-selected": String(selected.has(r.key)) },
      h("td", { class: "chk" }, box),
      h("td", { class: "strong" }, r.device),
      h("td", { class: "wide-only" }, r.browser),
      h("td", { class: "gpu wide-only", title: r.gpu }, r.gpu || "Not reported"),
      h("td", {}, engineName(r.engine)),
      h("td", {}, kvName(r.kv).replace(" memory", "")),
      h("td", { class: "r num strong" }, fmtSpeed(r.decodeTps)),
      h("td", { class: "r num wide-only" }, r.prefillTps ? fmtSpeed(r.prefillTps) : "Not reported"),
      h("td", { class: "r num wide-only" }, r.runs));
    return tr;
  }

  function drawCompare() {
    const picks = rows.filter((r) => selected.has(r.key)).sort((a, b) => b.decodeTps - a.decodeTps);
    if (picks.length < 2) return;
    const max = picks[0].decodeTps;
    compareSlot.replaceChildren(h("section", { class: "compare stack", "aria-labelledby": "cmp-h" },
      h("h2", { id: "cmp-h" }, "Writing speed, side by side"),
      h("div", {}, picks.map((r) => h("div", { class: "row" },
        h("div", { class: "label" }, r.device, h("small", {}, `${engineName(r.engine)}, ${kvName(r.kv)}, ${r.browser}`)),
        h("div", { class: "track", role: "img", "aria-label": `${fmtSpeed(r.decodeTps)} tokens a second` },
          h("div", { class: "fill", style: `width:${(r.decodeTps / max) * 100}%` })),
        h("div", { class: "r num strong" }, `${fmtSpeed(r.decodeTps)}`)))),
      h("p", { class: "muted" }, `${fmtSpeed(picks[0].decodeTps / picks[picks.length - 1].decodeTps)} times between the fastest and the slowest here. Tokens a second, higher is faster.`)));
  }

  async function load() {
    body.replaceChildren(h("p", { class: "muted", role: "status" }, "Loading results"));
    try {
      const res = await fetch("./data/results.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rows = tableRows(await res.json());
    } catch {
      const retry = h("button", { class: "btn outline", type: "button" }, "Try again");
      retry.addEventListener("click", load);
      body.replaceChildren(h("div", { class: "empty", role: "alert" },
        h("p", {}, h("strong", {}, "The results did not load.")),
        h("p", { class: "muted" }, "Check your connection, then try again."),
        h("div", { class: "actions" }, retry)));
      return;
    }
    if (!rows.length) {
      body.replaceChildren(h("div", { class: "empty" },
        h("p", {}, h("strong", {}, "No results yet.")),
        h("p", { class: "muted" }, "Run the test on your device and add the first row."),
        h("div", { class: "actions" }, h("a", { class: "btn primary", href: "#/run" }, "Run the test"))));
      return;
    }
    body.replaceChildren(toolbar, table, emptyMatch, compareSlot);
    draw();
  }

  root.append(selbar);
  load();
  return load;
}
