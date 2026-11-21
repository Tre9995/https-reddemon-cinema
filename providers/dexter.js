
/**
 * RedDemon Cinema - Dexter Provider
 *
 * Supports movies and TV episodes.
 * Returns streams in RedDemon's { streams: [...] } format.
 *
 * Optional environment variable:
 * DEXTER_BASE_URL=https://dexter.pw
 */

const DEXTER_BASE_URL = (
  process.env.DEXTER_BASE_URL || "https://dexter.pw"
).replace(/\/+$/, "");

const SERVER_IDS = [21, 1, 2, 3, 4, 5];

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

function isHttpUrl(value) {
  return typeof value === "string" &&
    /^https?:\/\//i.test(value);
}

function findStreamUrls(value, found = new Set()) {
  if (!value) return found;

  if (typeof value === "string") {
    const matches =
      value.match(/https?:\/\/[^\s"'<>]+/gi) || [];

    for (const match of matches) {
      const cleaned = match.replace(/[),\]}]+$/, "");

      if (/\.m3u8(?:[?#]|$)/i.test(cleaned)) {
        found.add(cleaned);
      }
    }

    if (
      /^https?:\/\/.+\.m3u8(?:[?#].*)?$/i.test(value.trim())
    ) {
      found.add(value.trim());
    }

    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      findStreamUrls(item, found);
    }

    return found;
  }

  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        typeof item === "string" &&
        /(?:url|file|src|link|stream|hls|playlist)/i.test(key) &&
        isHttpUrl(item) &&
        /\.m3u8(?:[?#]|$)/i.test(item)
      ) {
        found.add(item);
      } else {
        findStreamUrls(item, found);
      }
    }
  }

  return found;
}

function resolutionFromText(text) {
  const match = String(text || "").match(
    /(?:RESOLUTION=\d+x(\d+)|(\d{3,4})p)/i
  );

  const height = Number(match?.[1] || match?.[2] || 0);

  return height ? `${height}p` : "HLS";
}

async function fetchJson(url) {
  console.log("[Dexter] Requesting:", url);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Referer": `${DEXTER_BASE_URL}/`
      },
      signal: AbortSignal.timeout(15000)
    });

    console.log("[Dexter] HTTP status:", response.status);

    const body = await response.text();

    if (!response.ok) {
      console.error(
        "[Dexter] Response error:",
        body.slice(0, 500)
      );

      throw new Error(
        `Dexter returned HTTP ${response.status}`
      );
    }

    try {
      return JSON.parse(body);
    } catch {
      console.error(
        "[Dexter] Invalid JSON response:",
        body.slice(0, 500)
      );

      throw new Error(
        "Dexter returned an invalid JSON response"
      );
    }
  } catch (error) {
    console.error(
      "[Dexter] Request failed:",
      error.message
    );

    throw error;
  }
}

async function expandHls(masterUrl) {
  console.log("[Dexter] Checking HLS playlist");

  const response = await fetch(masterUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "*/*",
      "Referer": `${DEXTER_BASE_URL}/`
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    console.error(
      "[Dexter] HLS request failed:",
      response.status
    );

    return [];
  }

  const body = await response.text();

  if (!body.includes("#EXTM3U")) {
    console.error("[Dexter] Invalid HLS playlist");
    return [];
  }

  const lines = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const variants = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF")) {
      continue;
    }

    const nextLine = lines
      .slice(i + 1)
      .find(line => !line.startsWith("#"));

    if (!nextLine) continue;

    const streamUrl = new URL(
      nextLine,
      masterUrl
    ).toString();

    const label = resolutionFromText(lines[i]);

    variants.push({
      name: `Dexter ${label}`,
      title: `Dexter • ${label}`,
      url: streamUrl,
      type: "m3u8",
      behaviorHints: {
        notWebReady: false
      }
    });
  }

  if (variants.length) {
    console.log(
      "[Dexter] HLS variants found:",
      variants.length
    );

    return variants;
  }

  console.log("[Dexter] Using master HLS playlist");

  return [{
    name: "Dexter HLS",
    title: "Dexter • HLS",
    url: masterUrl,
    type: "m3u8",
    behaviorHints: {
      notWebReady: false
    }
  }];
}

/**
 * Get Dexter streams.
 *
 * type: "movie" or "series"
 * tmdbId: TMDB ID
 * season: required for series
 * episode: required for series
 */

export async function getDexterStreams(
  type,
  tmdbId,
  season,
  episode
) {
  console.log("[Dexter] Stream request started");

  console.log("[Dexter] Type:", type);
  console.log("[Dexter] TMDB ID:", tmdbId);

  if (!["movie", "series"].includes(type)) {
    throw new Error(
      "Dexter: unsupported content type"
    );
  }

  if (
    tmdbId === undefined ||
    tmdbId === null ||
    String(tmdbId).trim() === ""
  ) {
    throw new Error(
      "Dexter: TMDB ID is required"
    );
  }

  if (
    type === "series" &&
    (season == null || episode == null)
  ) {
    throw new Error(
      "Dexter: season and episode are required for series"
    );
  }

  if (type === "series") {
    console.log("[Dexter] Season:", season);
    console.log("[Dexter] Episode:", episode);
  }

  const safeId = encodeURIComponent(
    String(tmdbId)
  );

  const endpointFor = serverId => {
    if (type === "movie") {
      return (
        `${DEXTER_BASE_URL}/api/s/${serverId}/movie/` +
        `${safeId}?v=3`
      );
    }

    return (
      `${DEXTER_BASE_URL}/api/s/${serverId}/tv/${safeId}/` +
      `${encodeURIComponent(String(season))}/` +
      `${encodeURIComponent(String(episode))}?v=3`
    );
  };

  console.log(
    "[Dexter] Checking servers:",
    SERVER_IDS.join(", ")
  );

  const results = await Promise.allSettled(
    SERVER_IDS.map(async serverId => {
      const payload = await fetchJson(
        endpointFor(serverId)
      );

      console.log(
        `[Dexter] Server ${serverId} responded successfully`
      );

      return {
        serverId,
        payload
      };
    })
  );

  const urls = new Set();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const serverId = SERVER_IDS[i];

    if (result.status === "rejected") {
      console.error(
        `[Dexter] Server ${serverId} failed:`,
        result.reason?.message || result.reason
      );

      continue;
    }

    findStreamUrls(result.value.payload, urls);
  }

  console.log(
    "[Dexter] HLS URLs discovered:",
    urls.size
  );

  if (!urls.size) {
    console.error(
      "[Dexter] No HLS stream URLs were found"
    );

    const rejected = results.filter(
      result => result.status === "rejected"
    );

    if (rejected.length === SERVER_IDS.length) {
      throw new Error(
        "Dexter: all server requests failed. " +
        "The hosted server may be blocked or unable " +
        "to reach Dexter."
      );
    }

    return {
      streams: []
    };
  }

  const expanded = await Promise.all(
    [...urls].map(url =>
      expandHls(url).catch(error => {
        console.error(
          "[Dexter] Playlist expansion failed:",
          error.message
        );

        return [];
      })
    )
  );

  const unique = new Map();

  for (const stream of expanded.flat()) {
    if (
      stream.url &&
      !unique.has(stream.url)
    ) {
      unique.set(stream.url, stream);
    }
  }

  const streams = [...unique.values()];

  console.log(
    "[Dexter] Final streams returned:",
    streams.length
  );

  return {
    streams
  };
}
