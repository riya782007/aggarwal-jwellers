import { describe, it, expect } from "vitest";
import { classifyDevice } from "@/lib/deviceClass";

describe("classifyDevice", () => {
  it("phone", () => {
    expect(classifyDevice("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36"))
      .toEqual({ device: "phone", os: "Android", browser: "Chrome" });
    expect(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1").device).toBe("phone");
  });
  it("pc", () => {
    expect(classifyDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0 Safari/537.36 Edg/154.0"))
      .toEqual({ device: "pc", os: "Windows", browser: "Edge" });
  });
  it("tablet and app", () => {
    expect(classifyDevice("Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/154.0 Safari/537.36").device).toBe("tablet");
    expect(classifyDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/154.0 Mobile Safari/537.36", true).browser).toBe("Aggarwal app");
  });
});
