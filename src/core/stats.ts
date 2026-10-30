// Small statistics used for one run and for combining submissions.

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

function quantile(s: number[], q: number): number {
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function median(xs: number[]): number | null {
  return xs.length ? quantile(sorted(xs), 0.5) : null;
}

export function quartiles(xs: number[]): [number, number] | null {
  if (!xs.length) return null;
  const s = sorted(xs);
  return [quantile(s, 0.25), quantile(s, 0.75)];
}

export function tokensPerSecond(tokens: number, ms: number): number | null {
  return ms > 0 ? (tokens * 1000) / ms : null;
}
