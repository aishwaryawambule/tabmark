// What we can learn about the device from the browser, without asking and without
// anything that identifies the person. Pure: callers pass in what the browser reports.

export type DeviceKind = "phone" | "tablet" | "computer";

export interface DeviceInput {
  userAgent: string;
  uaData: null | {
    mobile: boolean;
    platform: string;
    platformVersion?: string;
    model?: string;
    architecture?: string;
    fullVersionList?: { brand: string; version: string }[];
  };
  gpu: { vendor?: string; architecture?: string; description?: string } | null;
  cores: number | null;
  memoryGB: number | null;
  touchPoints?: number;
}

export interface Device {
  kind: DeviceKind;
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  model: string; // from client hints, or what the person types; "" when unknown
  gpuVendor: string;
  gpuArchitecture: string;
  gpuDescription: string;
  cores: number | null;
  memoryGB: number | null; // navigator.deviceMemory: rounded, capped at 8 by browsers
}

const BRANDS: [RegExp, string][] = [
  [/Microsoft Edge/i, "Edge"],
  [/Opera/i, "Opera"],
  [/Brave/i, "Brave"],
  [/Samsung Internet/i, "Samsung Internet"],
  [/Google Chrome/i, "Chrome"],
  [/Chromium/i, "Chromium"],
];

const major = (v: string) => v.split(".")[0];
const majorMinor = (v: string) => v.split(/[._]/).slice(0, 2).join(".").replace(/\.0$/, "");

function browserFromHints(list: { brand: string; version: string }[]): [string, string] | null {
  for (const [re, name] of BRANDS) {
    const hit = list.find((b) => re.test(b.brand));
    if (hit) return [name, major(hit.version)];
  }
  return null;
}

function browserFromUA(ua: string): [string, string] {
  let m;
  if ((m = ua.match(/Edg\/([\d.]+)/))) return ["Edge", major(m[1])];
  if ((m = ua.match(/SamsungBrowser\/([\d.]+)/))) return ["Samsung Internet", major(m[1])];
  if ((m = ua.match(/Firefox\/([\d.]+)/))) return ["Firefox", major(m[1])];
  if ((m = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/))) return ["Chrome", major(m[1])];
  if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return ["Safari", majorMinor(m[1])];
  return ["Unknown", ""];
}

function osFromUA(ua: string): [string, string] {
  let m;
  if ((m = ua.match(/(?:iPhone|CPU) OS (\d+[_\d]*)/))) return ["iOS", majorMinor(m[1])];
  if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) return ["Android", majorMinor(m[1])];
  if (/Windows NT/.test(ua)) return ["Windows", ""];
  if (/Mac OS X/.test(ua)) return ["macOS", ""]; // frozen at 10_15_7 by browsers
  if (/CrOS/.test(ua)) return ["ChromeOS", ""];
  if (/Linux/.test(ua)) return ["Linux", ""];
  return ["Unknown", ""];
}

export function describeDevice(input: DeviceInput): Device {
  const { userAgent: ua, uaData } = input;
  const [browser, browserVersion] =
    (uaData?.fullVersionList && browserFromHints(uaData.fullVersionList)) || browserFromUA(ua);
  let [os, osVersion] = osFromUA(ua);
  if (uaData?.platform) {
    os = uaData.platform;
    if (uaData.platformVersion) osVersion = majorMinor(uaData.platformVersion);
  }
  let kind: DeviceKind = "computer";
  if (uaData ? uaData.mobile : /Mobi|iPhone|Android.+Mobile/.test(ua)) kind = "phone";
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) kind = "tablet";
  // iPadOS Safari reports itself as a Mac; a touch screen gives it away.
  if (os === "macOS" && browser === "Safari" && (input.touchPoints ?? 0) > 1) kind = "tablet";
  let model = uaData?.model ?? "";
  if (!model && /iPhone/.test(ua)) model = "iPhone";
  if (!model && kind === "tablet" && os === "macOS") model = "iPad";
  return {
    kind, os, osVersion, browser, browserVersion, model,
    gpuVendor: input.gpu?.vendor ?? "",
    gpuArchitecture: input.gpu?.architecture ?? "",
    gpuDescription: input.gpu?.description ?? "",
    cores: input.cores,
    memoryGB: input.memoryGB,
  };
}

// Groups submissions from the same kind of device and browser.
export function deviceKey(d: Device): string {
  const name = (d.model || `${d.os} ${d.gpuDescription || `${d.gpuVendor} ${d.gpuArchitecture}`}`).trim().toLowerCase();
  return [name, d.os.toLowerCase(), d.browser.toLowerCase(), d.browserVersion].join("|");
}

// Reads the live browser. Not unit tested: everything it returns goes through describeDevice.
export async function readBrowser(): Promise<DeviceInput> {
  const nav = navigator as Navigator & {
    userAgentData?: { mobile: boolean; platform: string; getHighEntropyValues(h: string[]): Promise<Record<string, unknown>> };
    deviceMemory?: number;
  };
  let uaData: DeviceInput["uaData"] = null;
  if (nav.userAgentData) {
    const hi = await nav.userAgentData
      .getHighEntropyValues(["platformVersion", "model", "architecture", "fullVersionList"])
      .catch(() => ({}));
    uaData = { mobile: nav.userAgentData.mobile, platform: nav.userAgentData.platform, ...(hi as object) };
  }
  let gpu: DeviceInput["gpu"] = null;
  const adapter = await nav.gpu?.requestAdapter().catch(() => null);
  if (adapter) {
    const info = adapter.info ?? {};
    gpu = { vendor: info.vendor, architecture: info.architecture, description: info.description };
  }
  return {
    userAgent: nav.userAgent, uaData, gpu,
    cores: nav.hardwareConcurrency ?? null,
    memoryGB: nav.deviceMemory ?? null,
    touchPoints: nav.maxTouchPoints ?? 0,
  };
}
