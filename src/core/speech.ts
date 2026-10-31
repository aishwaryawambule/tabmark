// The speech test: what it runs, what it downloads, and how its numbers are worked out.
// Speaking is Kokoro-82M; listening is Whisper base.en. Each runs on the graphics chip
// (WebGPU) and, optionally, on the processor (WebAssembly), so the two can be compared.

export const SPEECH_TASKS = ["speak", "listen"] as const;
export const BACKENDS = ["webgpu", "wasm"] as const;
export type SpeechTask = (typeof SPEECH_TASKS)[number];
export type Backend = (typeof BACKENDS)[number];

export interface SpeechStep {
  task: SpeechTask;
  backend: Backend;
  model: string; // stored in results
  repo: string; // Hugging Face repository
  dtype: string; // weights format, as stored in results
  downloadMB: number;
}

// Kokoro needs full-precision weights on WebGPU (its 16-bit files produce noise there);
// the processor runs the 8-bit file. Sizes are the published files, rounded.
export const SPEAK = { model: "Kokoro-82M", repo: "onnx-community/Kokoro-82M-v1.0-ONNX", voice: "af_heart" };
export const LISTEN = { model: "Whisper-base.en", repo: "onnx-community/whisper-base.en" };

export function speechPlan(withCpu: boolean): SpeechStep[] {
  const gpu: SpeechStep[] = [
    { task: "speak", backend: "webgpu", model: SPEAK.model, repo: SPEAK.repo, dtype: "fp32", downloadMB: 326 },
    { task: "listen", backend: "webgpu", model: LISTEN.model, repo: LISTEN.repo, dtype: "fp32+q4", downloadMB: 206 },
  ];
  if (!withCpu) return gpu;
  return [
    ...gpu,
    { task: "speak", backend: "wasm", model: SPEAK.model, repo: SPEAK.repo, dtype: "q8", downloadMB: 92 },
    { task: "listen", backend: "wasm", model: LISTEN.model, repo: LISTEN.repo, dtype: "q8", downloadMB: 77 },
  ];
}

export const speechDownloadMB = (plan: SpeechStep[]) => plan.reduce((a, s) => a + s.downloadMB, 0);

// What the speaking model reads aloud (about ten seconds), and the human clip the
// listening model transcribes (President Kennedy, 1961; public domain).
export const SPEAK_TEXT = [
  "The trail climbs slowly through an old forest of tall fir trees.",
  "Every morning the river is loud with melting snow.",
  "We reached the lake before noon and stopped to rest by the water.",
];
export const CLIP = {
  url: "./audio/jfk.wav",
  text: "And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.",
};

// Words in, words out: lower case, numbers kept, punctuation dropped.
export function words(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/'/g, "").split(/\s+/).filter(Boolean);
}

// Word error rate: the fewest insertions, deletions and substitutions that turn the
// reference into what was heard, divided by the reference length (0 is perfect).
export function wordErrorRate(reference: string, heard: string): number {
  const a = words(reference), b = words(heard);
  if (!a.length) return b.length ? 1 : 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.min(1, prev[b.length] / a.length);
}

// Speed as a multiple of real time: seconds of audio handled per second of work.
export const realTime = (audioSec: number, computeMs: number) => (computeMs > 0 ? audioSec / (computeMs / 1000) : 0);

// Above this, the audio check fails: the listening model could not make out the speech.
export const GARBLED = 0.3;
