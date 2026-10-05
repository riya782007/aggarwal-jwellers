/** Classify a user-agent into phone / tablet / pc, OS and browser. Pure, unit-tested. */
export type DeviceClass = { device: "phone" | "tablet" | "pc"; os: string; browser: string };

export function classifyDevice(ua: string, isApp = false): DeviceClass {
  const u = ua || "";
  const os = /Android/i.test(u) ? "Android"
    : /iPhone|iPad|iPod/i.test(u) ? "iOS"
    : /Windows/i.test(u) ? "Windows"
    : /Mac OS X|Macintosh/i.test(u) ? "macOS"
    : /CrOS/i.test(u) ? "ChromeOS"
    : /Linux/i.test(u) ? "Linux" : "Other";
  const tablet = /iPad|Tablet/i.test(u) || (/Android/i.test(u) && !/Mobile/i.test(u));
  const phone = !tablet && /Mobi|iPhone|iPod|Android.*Mobile/i.test(u);
  const device = tablet ? "tablet" : phone ? "phone" : "pc";
  const browser = isApp ? "Aggarwal app"
    : /Edg\//.test(u) ? "Edge"
    : /OPR\/|Opera/.test(u) ? "Opera"
    : /SamsungBrowser/.test(u) ? "Samsung Internet"
    : /Firefox|FxiOS/.test(u) ? "Firefox"
    : /Chrome|CriOS/.test(u) ? "Chrome"
    : /Safari/.test(u) ? "Safari" : "Other";
  return { device, os, browser };
}
