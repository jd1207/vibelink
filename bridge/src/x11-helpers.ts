import { execSync } from "child_process";
import { readdirSync } from "fs";

export interface WindowInfo {
  id: string;
  title: string;
  className: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function findXauthority(): string {
  const uid = process.getuid?.() ?? 1000;
  const dir = `/run/user/${uid}`;
  try {
    const files = readdirSync(dir);
    const xauth = files.find((f) => f.startsWith("xauth_"));
    if (xauth) return `${dir}/${xauth}`;
  } catch {
    // dir not readable
  }
  return `${process.env.HOME || "/tmp"}/.Xauthority`;
}

// minimal env for x11 subprocesses (ffmpeg, xdotool, xprop)
// full process.env breaks ffmpeg x11grab — plasma/kde session vars interfere
export function x11Env(): Record<string, string> {
  return {
    PATH: process.env.PATH || "/usr/bin:/bin",
    DISPLAY: ":0",
    XAUTHORITY: findXauthority(),
    HOME: process.env.HOME || "/tmp",
    USER: process.env.USER || "user",
    LOGNAME: process.env.LOGNAME || "user",
    LANG: process.env.LANG || "en_US.UTF-8",
  };
}

function parseGeometry(output: string): {
  x: number; y: number; width: number; height: number;
} {
  const vals: Record<string, number> = {};
  for (const line of output.split("\n")) {
    const [key, val] = line.split("=");
    if (key && val) vals[key.trim()] = parseInt(val.trim(), 10);
  }
  return {
    x: vals["X"] ?? 0,
    y: vals["Y"] ?? 0,
    width: vals["WIDTH"] ?? 0,
    height: vals["HEIGHT"] ?? 0,
  };
}

export function listWindows(): WindowInfo[] {
  let ids: string[];
  try {
    const raw = execSync("xdotool search --onlyvisible --name ''", {
      encoding: "utf-8",
      timeout: 5000,
      env: x11Env(),
    });
    ids = raw.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }

  const windows: WindowInfo[] = [];

  for (const decId of ids) {
    const hexId = parseInt(decId, 10).toString(16);
    try {
      const title = execSync(`xdotool getwindowname ${decId}`, {
        encoding: "utf-8",
        timeout: 2000,
        env: x11Env(),
      }).trim();

      if (!title || title === "Desktop" || title === "Plasma") continue;

      const geoRaw = execSync(`xdotool getwindowgeometry --shell ${decId}`, {
        encoding: "utf-8",
        timeout: 2000,
        env: x11Env(),
      });
      const geo = parseGeometry(geoRaw);

      if (geo.width < 100 || geo.height < 100) continue;

      let className = "";
      try {
        const xprop = execSync(
          `xprop -id ${decId} WM_CLASS 2>/dev/null`,
          { encoding: "utf-8", timeout: 2000, env: x11Env() }
        );
        const match = xprop.match(/"([^"]+)",\s*"([^"]+)"/);
        if (match) className = match[2];
      } catch {
        // xprop may not be available
      }

      windows.push({ id: hexId, title, className, ...geo });
    } catch {
      continue;
    }
  }

  return windows;
}

// query geometry of a single window by hex id
export function getWindowGeometry(hexId: string): { width: number; height: number } | null {
  const decId = parseInt(hexId, 16).toString(10);
  try {
    const raw = execSync(`xdotool getwindowgeometry --shell ${decId}`, {
      encoding: "utf-8",
      timeout: 2000,
      env: x11Env(),
    });
    const geo = parseGeometry(raw);
    if (geo.width > 0 && geo.height > 0) return { width: geo.width, height: geo.height };
  } catch {
    // window may have closed
  }
  return null;
}
