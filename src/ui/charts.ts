// Hand-built SVG charts: a dot plot (one row per device, a dot per series) and a bar
// chart. Thin marks, hairline grid, a ring of page colour around each dot, selective
// labels, and a tooltip on every mark (hover or keyboard focus). Redraws on resize.

import { h, svg } from "./dom";

export interface Series { key: string; label: string; color: string }
export interface DotRow { id: string; label: string; you: boolean; values: { series: string; value: number; detail: string }[] }
export interface BarRow { id: string; label: string; you: boolean; value: number; detail: string }

const ROW = 34;
const TOP = 26;
const BOTTOM = 8;

function niceScale(max: number): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 1, ticks: [0, 1] };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { max: top, ticks };
}

const fmtTick = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}K` : v.toLocaleString("en-US"));

function frame(host: HTMLElement, draw: (width: number, root: SVGSVGElement, tip: HTMLElement) => void) {
  const tip = h("div", { class: "tip", hidden: true, role: "tooltip" });
  const render = () => {
    const width = Math.max(280, host.clientWidth);
    const root = svg("svg", { role: "img" }) as SVGSVGElement;
    draw(width, root, tip);
    host.replaceChildren(root, tip);
  };
  render();
  const ro = new ResizeObserver(() => render());
  ro.observe(host);
  return () => ro.disconnect();
}

function layout(width: number) {
  const labelW = width < 520 ? 112 : 196;
  return { labelW, x0: labelW + 8, x1: width - 44 };
}

function clip(text: string, px: number) {
  const max = Math.floor(px / 7);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function axis(root: SVGSVGElement, ticks: number[], sx: (v: number) => number, height: number, unit: string) {
  for (const t of ticks) {
    const x = sx(t);
    root.append(svg("line", { class: "grid", x1: x, x2: x, y1: TOP - 6, y2: height - BOTTOM }));
    const label = svg("text", { class: "lbl", x, y: TOP - 12, "text-anchor": "middle" });
    label.textContent = fmtTick(t);
    root.append(label);
  }
  // The unit sits at the start of the axis row, over the device labels, clear of the ticks.
  const unitText = svg("text", { class: "lbl", x: 0, y: TOP - 12, "text-anchor": "start" });
  unitText.textContent = unit;
  root.append(unitText);
}

function attachTip(hit: SVGElement, tip: HTMLElement, x: number, y: number, html: [string, string]) {
  const show = () => {
    tip.replaceChildren(h("b", {}, html[0]), document.createElement("br"), html[1]);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.hidden = false;
  };
  const hide = () => (tip.hidden = true);
  hit.addEventListener("pointerenter", show);
  hit.addEventListener("pointerleave", hide);
  hit.addEventListener("focus", show);
  hit.addEventListener("blur", hide);
}

function rowLabel(root: SVGSVGElement, label: string, you: boolean, y: number, labelW: number) {
  const t = svg("text", { class: `dev${you ? " you" : ""}`, x: 0, y: y + 4 });
  t.textContent = clip(you ? `You: ${label}` : label, labelW);
  root.append(t);
}

export function dotPlot(host: HTMLElement, rows: DotRow[], series: Series[], opts: { unit: string; title: string }) {
  return frame(host, (width, root, tip) => {
    const { labelW, x0, x1 } = layout(width);
    const height = TOP + rows.length * ROW + BOTTOM;
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    root.setAttribute("height", String(height));
    root.setAttribute("aria-label", opts.title);
    const max = Math.max(...rows.flatMap((r) => r.values.map((v) => v.value)), 1);
    const { max: top, ticks } = niceScale(max);
    const sx = (v: number) => x0 + (v / top) * (x1 - x0);
    rows.forEach((r, i) => {
      if (r.you) root.append(svg("rect", { class: "band", x: -6, y: TOP + i * ROW, width: width + 6, height: ROW }));
    });
    axis(root, ticks, sx, height, opts.unit);
    const color = new Map(series.map((s) => [s.key, s]));
    rows.forEach((r, i) => {
      const y = TOP + i * ROW + ROW / 2;
      rowLabel(root, r.label, r.you, y, labelW);
      const vs = [...r.values].sort((a, b) => a.value - b.value);
      if (vs.length > 1) root.append(svg("line", { class: "link", x1: sx(vs[0].value), x2: sx(vs[vs.length - 1].value), y1: y, y2: y }));
      for (const v of r.values) {
        const s = color.get(v.series)!;
        const cx = sx(v.value);
        root.append(svg("circle", { cx, cy: y, r: 7, fill: "var(--bg)" }));
        root.append(svg("circle", { cx, cy: y, r: 5, fill: s.color }));
        const hit = svg("circle", { class: "hit", cx, cy: y, r: 12, tabindex: 0, "aria-label": `${r.label}, ${s.label}: ${v.detail}` });
        attachTip(hit, tip, cx, y, [`${r.label}`, `${s.label}: ${v.detail}`]);
        root.append(hit);
      }
      // Label sparingly: the fastest value on the top row and on your row.
      if ((i === 0 || r.you) && vs.length) {
        const best = vs[vs.length - 1];
        const t = svg("text", { class: "val num", x: sx(best.value) + 10, y: y + 4 });
        t.textContent = best.value < 10 ? best.value.toFixed(1) : String(Math.round(best.value));
        root.append(t);
      }
    });
  });
}

export function barChart(host: HTMLElement, rows: BarRow[], opts: { unit: string; title: string; color: string }) {
  return frame(host, (width, root, tip) => {
    const { labelW, x0, x1 } = layout(width);
    const height = TOP + rows.length * ROW + BOTTOM;
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    root.setAttribute("height", String(height));
    root.setAttribute("aria-label", opts.title);
    const { max: top, ticks } = niceScale(Math.max(...rows.map((r) => r.value), 1));
    const sx = (v: number) => x0 + (v / top) * (x1 - x0);
    rows.forEach((r, i) => {
      if (r.you) root.append(svg("rect", { class: "band", x: -6, y: TOP + i * ROW, width: width + 6, height: ROW }));
    });
    axis(root, ticks, sx, height, opts.unit);
    rows.forEach((r, i) => {
      const y = TOP + i * ROW + ROW / 2;
      rowLabel(root, r.label, r.you, y, labelW);
      const w = Math.max(0, sx(r.value) - x0);
      const bh = 16;
      if (w > 0) {
        // Square at the baseline, 4px rounded at the data end.
        const rr = Math.min(4, w);
        root.append(svg("path", {
          d: `M${x0} ${y - bh / 2} H${x0 + w - rr} Q${x0 + w} ${y - bh / 2} ${x0 + w} ${y - bh / 2 + rr} V${y + bh / 2 - rr} Q${x0 + w} ${y + bh / 2} ${x0 + w - rr} ${y + bh / 2} H${x0} Z`,
          fill: opts.color,
        }));
      }
      const t = svg("text", { class: "val num", x: x0 + w + 6, y: y + 4 });
      t.textContent = r.value ? r.value.toLocaleString("en-US") : "None loaded";
      root.append(t);
      const hit = svg("rect", { class: "hit", x: x0, y: y - ROW / 2, width: Math.max(w, 40), height: ROW, tabindex: 0, "aria-label": `${r.label}: ${r.detail}` });
      attachTip(hit, tip, x0 + Math.max(w, 40) / 2, y - bh / 2, [r.label, r.detail]);
      root.append(hit);
    });
  });
}

// Three thin bars per row, one per series, grown from one baseline with a 2px gap.
// The highlighted row is labelled with its values; every bar has a tooltip.
export function groupBars(host: HTMLElement, rows: DotRow[], series: Series[], opts: { unit: string; title: string }) {
  return frame(host, (width, root, tip) => {
    const { labelW, x0, x1 } = layout(width);
    const ROWG = 40;
    const height = TOP + rows.length * ROWG + BOTTOM;
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    root.setAttribute("height", String(height));
    root.setAttribute("aria-label", opts.title);
    const { max: top, ticks } = niceScale(Math.max(...rows.flatMap((r) => r.values.map((v) => v.value)), 1));
    const sx = (v: number) => x0 + (v / top) * (x1 - x0);
    rows.forEach((r, i) => {
      if (r.you) root.append(svg("rect", { class: "band", x: -6, y: TOP + i * ROWG, width: width + 6, height: ROWG }));
    });
    axis(root, ticks, sx, height, opts.unit);
    const color = new Map(series.map((s) => [s.key, s]));
    const bh = 8;
    const gap = 2;
    rows.forEach((r, i) => {
      const yTop = TOP + i * ROWG + (ROWG - (series.length * bh + (series.length - 1) * gap)) / 2;
      const t = svg("text", { class: `dev${r.you ? " you" : ""}`, x: 0, y: TOP + i * ROWG + ROWG / 2 + 4 });
      t.textContent = clip(r.label, labelW);
      root.append(t);
      r.values.forEach((v, j) => {
        const s = color.get(v.series)!;
        const y = yTop + j * (bh + gap);
        const w = Math.max(1, sx(v.value) - x0);
        const rr = Math.min(4, w, bh / 2);
        root.append(svg("path", {
          d: `M${x0} ${y} H${x0 + w - rr} Q${x0 + w} ${y} ${x0 + w} ${y + rr} V${y + bh - rr} Q${x0 + w} ${y + bh} ${x0 + w - rr} ${y + bh} H${x0} Z`,
          fill: s.color,
        }));
        const hit = svg("rect", { class: "hit", x: x0, y: y - 1, width: Math.max(w, 24), height: bh + 2, tabindex: 0, "aria-label": `${r.label}, ${s.label}: ${v.detail}` });
        attachTip(hit, tip, x0 + Math.max(w, 24) / 2, y, [r.label, `${s.label}: ${v.detail}`]);
        root.append(hit);
      });
      // One label for the highlighted row, at the end of its longest bar: all values in order.
      if (r.you) {
        const longest = Math.max(...r.values.map((v) => v.value));
        const lab = svg("text", { class: "val num", x: sx(longest) + 8, y: TOP + i * ROWG + ROWG / 2 + 4 });
        lab.textContent = `${r.values.map((v) => v.value.toFixed(1)).join(" → ")} ${opts.unit}`;
        root.append(lab);
      }
    });
  });
}
