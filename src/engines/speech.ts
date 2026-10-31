// Runs the speech steps: Kokoro speaking and Whisper listening, through transformers.js,
// on WebGPU or WebAssembly. Each step loads its model, does one untimed warm-up (which
// also compiles the GPU shaders), then times the same work on every device.

import { CLIP, SPEAK_TEXT, realTime, wordErrorRate, type PlannedSpeech } from "../core/speech";
import type { SpeechResult } from "../core/result";
import type { Hooks } from "./types";

export const TRANSFORMERS_VERSION = __TRANSFORMERS_VERSION__;
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// Sums download progress over every file a model fetches.
function progress(hooks: Hooks, label: string) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== "progress" || !p.file || !p.total) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    let loaded = 0, total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    hooks.status(`${label} ${Math.round(total / 1e6)} MB`, total ? loaded / total : undefined);
  };
}

function failed(step: PlannedSpeech, e: unknown): SpeechResult {
  const error = (e instanceof Error ? e.message : String(e)).replace(/[^\p{L}\p{N} .,:;()_+\-/'#@&]/gu, " ").slice(0, 200);
  return { task: step.task, engineVersion: TRANSFORMERS_VERSION, model: step.model, backend: step.backend, dtype: step.dtype, status: "failed", error };
}

export interface Spoken { result: SpeechResult; audio?: Float32Array; sampleRate?: number }

// One voice model behind one interface: say a sentence, get samples back.
interface Speaker { say(text: string): Promise<{ audio: Float32Array; sampling_rate: number }>; dispose(): Promise<void> }
const VOICES: Record<string, string> = {
  Supertonic: "https://huggingface.co/onnx-community/Supertonic-TTS-ONNX/resolve/main/voices/F1.bin",
};

async function loadSpeaker(step: PlannedSpeech, hooks: Hooks): Promise<Speaker> {
  const progress_callback = progress(hooks, "Downloading") as never;
  if (step.model === "Kokoro-82M") {
    const { KokoroTTS } = await import("kokoro-js");
    const tts = await KokoroTTS.from_pretrained(step.repo, { dtype: step.load as never, device: step.backend, progress_callback });
    return {
      say: (text) => tts.generate(text, { voice: "af_heart" }) as never,
      dispose: async () => { await tts.model.dispose(); },
    };
  }
  const { pipeline } = await import("@huggingface/transformers");
  const tts = (await pipeline("text-to-speech", step.repo, { device: step.backend, dtype: step.load as never, progress_callback })) as unknown as {
    (text: string, opts: Record<string, unknown>): Promise<{ audio: Float32Array; sampling_rate: number }>; dispose(): Promise<void>;
  };
  const opts = { speaker_embeddings: VOICES[step.model], num_inference_steps: 5, speed: 1.0 };
  return { say: (text) => tts(text, opts), dispose: () => tts.dispose() };
}

export interface Spoken { result: SpeechResult; audio?: Float32Array; sampleRate?: number }

export async function runSpeak(step: PlannedSpeech, hooks: Hooks): Promise<Spoken> {
  let speaker: Speaker | undefined;
  try {
    const t0 = performance.now();
    speaker = await loadSpeaker(step, hooks);
    const loadMs = Math.round(performance.now() - t0);
    hooks.status("Warming up");
    await speaker.say("Hello there.");
    hooks.status("Speaking");
    const parts: Float32Array[] = [];
    let sampleRate = 24000, firstAudioMs = 0;
    const start = performance.now();
    for (const sentence of SPEAK_TEXT) {
      const out = await speaker.say(sentence);
      parts.push(out.audio);
      sampleRate = out.sampling_rate;
      if (!firstAudioMs) firstAudioMs = Math.round(performance.now() - start);
      hooks.token(performance.now());
    }
    const computeMs = Math.round(performance.now() - start);
    const audio = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { audio.set(p, at); at += p.length; }
    const audioSec = round(audio.length / sampleRate);
    return {
      result: { task: "speak", engineVersion: TRANSFORMERS_VERSION, model: step.model, backend: step.backend, dtype: step.dtype, status: "ok",
        loadMs, audioSec, computeMs, realTime: round(realTime(audioSec, computeMs)), firstAudioMs },
      audio, sampleRate,
    };
  } catch (e) {
    return { result: failed(step, e) };
  } finally {
    await speaker?.dispose().catch(() => {});
  }
}

// Whisper wants 16 kHz mono.
export async function to16k(audio: Float32Array, sampleRate: number): Promise<Float32Array> {
  if (sampleRate === 16000) return audio;
  const ctx = new OfflineAudioContext(1, Math.ceil((audio.length * 16000) / sampleRate), 16000);
  const buf = ctx.createBuffer(1, audio.length, sampleRate);
  buf.copyToChannel(audio as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  return (await ctx.startRendering()).getChannelData(0);
}

export async function loadClip(): Promise<Float32Array> {
  const bytes = await (await fetch(CLIP.url)).arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const decoded = await ctx.decodeAudioData(bytes);
  return to16k(decoded.getChannelData(0), decoded.sampleRate);
}

// Listens to the human clip (timed, scored against its transcript), then to each voice
// the speaking steps produced, to check that the speech came out as words.
export async function runListen(step: PlannedSpeech, hooks: Hooks, clip: Float32Array, voices: Float32Array[]): Promise<{ result: SpeechResult; voiceErrors: number[] }> {
  type Asr = { (audio: Float32Array): Promise<{ text: string } | { text: string }[]>; dispose(): Promise<void> };
  let asr: Asr | undefined;
  try {
    const { pipeline } = await import("@huggingface/transformers");
    const t0 = performance.now();
    asr = (await pipeline("automatic-speech-recognition", step.repo, {
      device: step.backend,
      dtype: step.load as never,
      progress_callback: progress(hooks, "Downloading") as never,
    })) as unknown as Asr;
    const loadMs = Math.round(performance.now() - t0);
    const text = (o: { text: string } | { text: string }[]) => (Array.isArray(o) ? o.map((x) => x.text).join(" ") : o.text);
    const multilingual = step.repo.includes("large-v3");
    const hear = (a: Float32Array) => (multilingual ? (asr as unknown as (a: Float32Array, o: object) => ReturnType<Asr>)(a, { language: "english", task: "transcribe" }) : asr!(a));
    hooks.status("Warming up");
    await hear(clip.subarray(0, 16000 * 2));
    hooks.status("Listening");
    const start = performance.now();
    const heard = text(await hear(clip));
    const computeMs = Math.round(performance.now() - start);
    hooks.token(performance.now());
    const audioSec = round(clip.length / 16000);
    const voiceErrors: number[] = [];
    for (const v of voices) voiceErrors.push(round(wordErrorRate(SPEAK_TEXT.join(" "), text(await hear(v))), 3));
    return {
      result: { task: "listen", engineVersion: TRANSFORMERS_VERSION, model: step.model, backend: step.backend, dtype: step.dtype, status: "ok",
        loadMs, audioSec, computeMs, realTime: round(realTime(audioSec, computeMs)), wordErrors: round(wordErrorRate(CLIP.text, heard), 3) },
      voiceErrors,
    };
  } catch (e) {
    return { result: failed(step, e), voiceErrors: [] };
  } finally {
    await asr?.dispose().catch(() => {});
  }
}
