import { describe, expect, it } from "vitest";
import { describeDevice, deviceKey } from "../src/core/device";

const mac = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  uaData: { mobile: false, platform: "macOS", platformVersion: "26.5.0", model: "", architecture: "arm",
            fullVersionList: [{ brand: "Google Chrome", version: "148.0.7551.3" }, { brand: "Chromium", version: "148.0.7551.3" }] },
  gpu: { vendor: "apple", architecture: "metal-3", description: "" },
  cores: 14, memoryGB: 8,
};
const pixel = {
  userAgent: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
  uaData: { mobile: true, platform: "Android", platformVersion: "16.0.0", model: "Pixel 8", architecture: "",
            fullVersionList: [{ brand: "Chromium", version: "147.0.1" }, { brand: "Google Chrome", version: "147.0.1" }] },
  gpu: { vendor: "arm", architecture: "valhall", description: "" },
  cores: 9, memoryGB: 8,
};
const iphone = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1",
  uaData: null, gpu: { vendor: "apple", architecture: "common-3", description: "" }, cores: 6, memoryGB: null,
};
const firefoxWin = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
  uaData: null, gpu: { vendor: "nvidia", architecture: "ada", description: "NVIDIA GeForce RTX 4070" }, cores: 16, memoryGB: null,
};

describe("describeDevice", () => {
  it("reads a Mac on Chrome from client hints", () => {
    expect(describeDevice(mac)).toMatchObject({ kind: "computer", os: "macOS", osVersion: "26.5", browser: "Chrome", browserVersion: "148",
      model: "", gpuVendor: "apple", gpuArchitecture: "metal-3", cores: 14, memoryGB: 8 });
  });
  it("reads an Android phone model from client hints", () => {
    expect(describeDevice(pixel)).toMatchObject({ kind: "phone", os: "Android", osVersion: "16", browser: "Chrome", model: "Pixel 8" });
  });
  it("falls back to the user agent on Safari for iPhone", () => {
    expect(describeDevice(iphone)).toMatchObject({ kind: "phone", os: "iOS", osVersion: "26.1", browser: "Safari", browserVersion: "26.1", model: "iPhone", memoryGB: null });
  });
  it("falls back to the user agent on Firefox for Windows", () => {
    expect(describeDevice(firefoxWin)).toMatchObject({ kind: "computer", os: "Windows", browser: "Firefox", browserVersion: "150", gpuDescription: "NVIDIA GeForce RTX 4070" });
  });
  it("an iPad on Safari reports as a Mac, so it is marked unsure", () => {
    const ipadLike = { ...iphone, userAgent: mac.userAgent.replace("Chrome/148.0.0.0 Safari/537.36", "Version/26.1 Safari/605.1.15"), cores: 8 };
    const d = describeDevice({ ...ipadLike, touchPoints: 5 });
    expect(d.kind).toBe("tablet");
  });
});

describe("deviceKey", () => {
  it("is stable for the same device and browser, and ignores the browser patch version", () => {
    const a = describeDevice(mac);
    const b = describeDevice({ ...mac, uaData: { ...mac.uaData, fullVersionList: [{ brand: "Google Chrome", version: "148.0.9999.1" }] } });
    expect(deviceKey(a)).toBe(deviceKey(b));
    expect(deviceKey(a)).not.toBe(deviceKey(describeDevice(pixel)));
  });
  it("uses the name the person typed when there is one", () => {
    const d = { ...describeDevice(mac), model: "MacBook Pro M5 Pro" };
    expect(deviceKey(d)).toContain("macbook pro m5 pro");
  });
});
