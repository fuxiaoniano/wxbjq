// Shared only by the standalone video downloader page.
const ADS_MIND_HOST = "adsmind.gdtimg.com";
const DOUYIN_HOSTS = new Set(["douyin.com", "www.douyin.com"]);
const DOUYIN_SHORT_HOSTS = new Set(["v.douyin.com"]);

function cleanCandidate(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/\\([_&*])/g, "$1")
    .replace(/[),.;:!?，。；：！？\]}]+$/g, "")
    .trim();
}

export function isSupportedVideoUrl(value, sourceType = "adsmind") {
  try {
    const url = new URL(cleanCandidate(value));
    const hasSafeAuthority = (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.port
    );
    if (!hasSafeAuthority) return false;
    if (sourceType === "douyin") {
      const host = url.hostname.toLowerCase();
      return (
        (DOUYIN_HOSTS.has(host) && /^\/video\/\d+\/?$/i.test(url.pathname)) ||
        (DOUYIN_SHORT_HOSTS.has(host) && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))
      );
    }
    return url.hostname.toLowerCase() === ADS_MIND_HOST && url.pathname.toLowerCase().endsWith(".mp4");
  } catch (error) {
    return false;
  }
}

function normalizedVideoUrl(value, sourceType) {
  const url = new URL(value);
  url.hash = "";
  if (sourceType === "douyin") {
    const videoId = url.pathname.match(/^\/video\/(\d+)\/?$/i)?.[1];
    if (videoId) return `https://www.douyin.com/video/${videoId}`;
    url.protocol = "https:";
    url.hostname = "v.douyin.com";
    url.search = "";
    return url.toString();
  }
  return url.toString();
}

export function extractVideoLinks(text, sourceType = "adsmind") {
  const candidates = String(text || "").match(/https?:\/\/[^\s<>"'|\])]+/gi) || [];
  const unique = new Map();
  let unsupportedCount = 0;

  for (const candidate of candidates) {
    const cleaned = cleanCandidate(candidate);
    if (!isSupportedVideoUrl(cleaned, sourceType)) {
      unsupportedCount += 1;
      continue;
    }
    const key = normalizedVideoUrl(cleaned, sourceType);
    if (!unique.has(key)) unique.set(key, key);
  }

  return {
    links: [...unique.values()],
    duplicateCount: Math.max(0, candidates.length - unsupportedCount - unique.size),
    unsupportedCount,
  };
}

export function filenameFromUrl(value) {
  let filename = "video.mp4";
  try {
    const url = new URL(value);
    const douyinId = DOUYIN_HOSTS.has(url.hostname.toLowerCase())
      ? url.pathname.match(/^\/video\/(\d+)\/?$/i)?.[1]
      : "";
    if (douyinId) return `douyin_${douyinId}.mp4`;
    filename = decodeURIComponent(url.pathname.split("/").pop() || filename);
  } catch (error) {
    filename = "video.mp4";
  }
  const cleaned = filename
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);
  return (cleaned || "video.mp4").toLowerCase().endsWith(".mp4")
    ? cleaned
    : `${cleaned || "video"}.mp4`;
}

function dateToken(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const year = String(value.getFullYear());
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function renamedFilename(pattern, originalFilename, index, total, date = new Date()) {
  const original = String(originalFilename || "video.mp4").replace(/\.mp4$/i, "") || "video";
  const width = Math.max(2, String(Math.max(1, Number(total) || 1)).length);
  const sequence = String(Math.max(1, Number(index) || 1)).padStart(width, "0");
  const template = String(pattern || "").trim() || "{原名}";
  const rendered = template
    .replace(/\{序号\}/g, sequence)
    .replace(/\{原名\}/g, original)
    .replace(/\{日期\}/g, dateToken(date))
    .replace(/\.mp4$/i, "")
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 176);
  return `${rendered || original || "video"}.mp4`;
}

export function uniqueFilename(filename, usedNames) {
  const dot = filename.toLowerCase().lastIndexOf(".mp4");
  const stem = dot >= 0 ? filename.slice(0, dot) : filename;
  const extension = dot >= 0 ? filename.slice(dot) : ".mp4";
  let candidate = `${stem}${extension}`;
  let number = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem} (${number})${extension}`;
    number += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

export async function runDownloadPipeline(items, options) {
  const readiness = items.map(() => {
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    return { promise, release };
  });
  let downloadCursor = 0;

  const resolver = async () => {
    for (let index = 0; index < items.length; index += 1) {
      if (options.isCancelled()) break;
      await options.resolve(items[index]);
      readiness[index].release();
    }
    for (const gate of readiness) gate.release();
  };

  const worker = async () => {
    while (downloadCursor < items.length) {
      const index = downloadCursor;
      downloadCursor += 1;
      await readiness[index].promise;
      if (options.isCancelled()) return;
      if (items[index].status === "ready") await options.download(items[index]);
    }
  };

  const workerCount = Math.max(1, Math.min(items.length, options.downloadConcurrency || 2));
  await Promise.all([resolver(), ...Array.from({ length: workerCount }, () => worker())]);
}
