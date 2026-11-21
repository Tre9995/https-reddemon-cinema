
/**
 * RedDemon Cinema - Q08 Dexter Provider
 *
 * Uses the Q08 Stremio stream API.
 * Supports movies and series using TMDB IDs.
 *
 * Returns both Proxy and Direct streams.
 */

const DEXTER_BASE_URL = "https://dexter.q-1208.fun";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

export async function getDexterStreams(
  type,
  tmdbId,
  season,
  episode
) {
  console.log("[Q08 Dexter] Request started");
  console.log("[Q08 Dexter] Type:", type);
  console.log("[Q08 Dexter] TMDB ID:", tmdbId);

  if (!["movie", "series"].includes(type)) {
    throw new Error("Q08 Dexter: Unsupported content type");
  }

  if (!tmdbId) {
    throw new Error("Q08 Dexter: TMDB ID is required");
  }

  if (
    type === "series" &&
    (season == null || episode == null)
  ) {
    throw new Error(
      "Q08 Dexter: Season and episode are required"
    );
  }

  // Q08 accepts IMDb IDs and TMDB-prefixed IDs.
  let contentId = `tmdb:${tmdbId}`;

  if (type === "series") {
    contentId += `:${season}:${episode}`;
  }

  const endpoint =
    `${DEXTER_BASE_URL}/stream/${type}/` +
    `${encodeURIComponent(contentId).replace(/%3A/gi, ":")}.json`;

  try {
    console.log("[Q08 Dexter] Fetching stream list");

    const response = await fetch(endpoint, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      throw new Error(
        `Q08 returned HTTP ${response.status}`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data.streams)) {
      console.log("[Q08 Dexter] No streams returned");

      return { streams: [] };
    }

    const streams = data.streams
      .filter(stream =>
        stream &&
        typeof stream.url === "string" &&
        /^https?:\/\//i.test(stream.url)
      )
      .map(stream => ({
        name: stream.name || "Q08 Dexter",
        title: stream.title || "Q08 Dexter",
        url: stream.url,
        type: "m3u8",
        behaviorHints: stream.behaviorHints || {
          notWebReady: false
        }
      }));

    console.log(
      "[Q08 Dexter] Streams returned:",
      streams.length
    );

    console.log(
      "[Q08 Dexter] Proxy streams:",
      streams.filter(s =>
        s.name.includes("[Proxy]")
      ).length
    );

    console.log(
      "[Q08 Dexter] Direct streams:",
      streams.filter(s =>
        s.name.includes("[Direct]")
      ).length
    );

    return { streams };

  } catch (error) {
    console.error(
      "[Q08 Dexter] Request failed:",
      error.message
    );

    throw error;
  }
    }
      
