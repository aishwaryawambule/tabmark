// The live speed line in the running row: one point per token, drawn as tokens arrive.

export function rollingRates(arrivalsMs: number[], window = 8): number[] {
  const out: number[] = [];
  for (let i = 1; i < arrivalsMs.length; i++) {
    const j = Math.max(0, i - window);
    const dt = arrivalsMs[i] - arrivalsMs[j];
    out.push(dt > 0 ? ((i - j) * 1000) / dt : 0);
  }
  return out;
}

export function tracePath(rates: number[], box: { width: number; height: number; max: number }): string {
  if (!rates.length) return "";
  const step = rates.length > 1 ? box.width / (rates.length - 1) : 0;
  const y = (r: number) => box.height - (Math.min(r, box.max) / box.max) * box.height;
  return rates.map((r, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${y(r).toFixed(1)}`).join(" ");
}
