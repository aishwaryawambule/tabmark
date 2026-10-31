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

// One way to run a model on one backend: the weights format and the download.
interface Build { dtype: string; load: string | Record<string, string>; mb: number }
export interface SpeechModel {
  id: string; // stored in results
  name: string;
  task: SpeechTask;
  repo: string;
  licence: string;
  note: string;
  gpu: Build;
  cpu: Build | null; // null: too slow or too big for the processor
}

// Every model here is open, runs through transformers.js in the browser, and was
// checked end to end. Sizes are the published files, rounded to whole MB.
export const SPEECH_MODELS: SpeechModel[] = [
  { id: "Kokoro-82M", name: "Kokoro 82M", task: "speak", repo: "onnx-community/Kokoro-82M-v1.0-ONNX", licence: "Apache-2.0",
    note: "The most natural small voice. Needs full precision on the graphics chip.",
    gpu: { dtype: "fp32", load: "fp32", mb: 326 }, cpu: { dtype: "q8", load: "q8", mb: 92 } },
  { id: "Supertonic", name: "Supertonic", task: "speak", repo: "onnx-community/Supertonic-TTS-ONNX", licence: "OpenRAIL-M",
    note: "A newer, very fast voice model; five refinement steps.",
    gpu: { dtype: "fp32", load: "fp32", mb: 262 }, cpu: { dtype: "fp32", load: "fp32", mb: 262 } },
  { id: "Whisper-tiny.en", name: "Whisper tiny", task: "listen", repo: "onnx-community/whisper-tiny.en", licence: "MIT",
    note: "The smallest Whisper. English.",
    gpu: { dtype: "fp32+q4", load: { encoder_model: "fp32", decoder_model_merged: "q4" }, mb: 120 }, cpu: { dtype: "q8", load: "q8", mb: 41 } },
  { id: "Whisper-base.en", name: "Whisper base", task: "listen", repo: "onnx-community/whisper-base.en", licence: "MIT",
    note: "A good default. English.",
    gpu: { dtype: "fp32+q4", load: { encoder_model: "fp32", decoder_model_merged: "q4" }, mb: 206 }, cpu: { dtype: "q8", load: "q8", mb: 77 } },
  { id: "Whisper-small.en", name: "Whisper small", task: "listen", repo: "onnx-community/whisper-small.en", licence: "MIT",
    note: "More accurate, about three times the size of base. English.",
    gpu: { dtype: "fp32+q4", load: { encoder_model: "fp32", decoder_model_merged: "q4" }, mb: 586 }, cpu: { dtype: "q8", load: "q8", mb: 249 } },
  { id: "Whisper-large-v3-turbo", name: "Whisper large v3 turbo", task: "listen", repo: "onnx-community/whisper-large-v3-turbo", licence: "MIT",
    note: "The large one, 99 languages. Graphics chip only; laptops with a good one.",
    gpu: { dtype: "q4", load: { encoder_model: "q4", decoder_model_merged: "q4" }, mb: 759 }, cpu: null },
  { id: "Moonshine-tiny", name: "Moonshine tiny", task: "listen", repo: "onnx-community/moonshine-tiny-ONNX", licence: "MIT",
    note: "Built for live captions on small devices. English.",
    gpu: { dtype: "fp32+q4", load: { encoder_model: "fp32", decoder_model_merged: "q4" }, mb: 76 }, cpu: { dtype: "q8", load: "q8", mb: 28 } },
  { id: "Moonshine-base", name: "Moonshine base", task: "listen", repo: "onnx-community/moonshine-base-ONNX", licence: "MIT",
    note: "Moonshine's larger size. English.",
    gpu: { dtype: "fp32+q4", load: { encoder_model: "fp32", decoder_model_merged: "q4" }, mb: 154 }, cpu: { dtype: "q8", load: "q8", mb: 64 } },
  { id: "Parakeet-CTC-0.6B", name: "Parakeet CTC 0.6B", task: "listen", repo: "onnx-community/parakeet-ctc-0.6b-ONNX", licence: "CC-BY-4.0",
    note: "NVIDIA's speech recogniser; no decoder loop, so it reads in one pass. English.",
    gpu: { dtype: "q4", load: "q4", mb: 643 }, cpu: { dtype: "q4", load: "q4", mb: 643 } },
];
export const DEFAULT_SPEAK = "Kokoro-82M";
export const DEFAULT_LISTEN = "Whisper-base.en";
export const speechModel = (id: string) => SPEECH_MODELS.find((m) => m.id === id);
export const speakers = () => SPEECH_MODELS.filter((m) => m.task === "speak");
export const listeners = () => SPEECH_MODELS.filter((m) => m.task === "listen");

export interface PlannedSpeech extends SpeechStep { load: string | Record<string, string> }

// Speak then listen on the graphics chip, then the same on the processor if asked (and if
// the model runs there). Without WebGPU only the processor steps remain.
export function speechPlan(speakId: string, listenId: string, withCpu: boolean, hasGpu = true): PlannedSpeech[] {
  const out: PlannedSpeech[] = [];
  const add = (id: string, backend: Backend) => {
    const m = speechModel(id);
    const b = m && (backend === "webgpu" ? m.gpu : m.cpu);
    if (m && b) out.push({ task: m.task, backend, model: m.id, repo: m.repo, dtype: b.dtype, downloadMB: b.mb, load: b.load });
  };
  if (hasGpu) { add(speakId, "webgpu"); add(listenId, "webgpu"); }
  if (withCpu || !hasGpu) { add(speakId, "wasm"); add(listenId, "wasm"); }
  return out;
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
