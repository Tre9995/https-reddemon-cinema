
const DEXTER_BASE_URL = "https://dexter.q-1208.fun";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

export async function getDexterStreams(
  type,
  imdbId,
  season,
  episode
) {
  console.log("[Q08 Dexter] Request started");
  console.log("[Q08 Dexter] IMDb ID:", imdbId);

  if (!["movie", "series"].includes(type)) {
    return { streams: [] };
  }

  if (!imdbId || !imdbId.startsWith("tt")) {
    console.log("[Q08 Dexter] Valid IMDb ID required");
    return { streams: [] };
  }

  let contentId = imdbId;

  if (type === "series") {
    if (season == null || episode == null) {
      console.log("[Q08 Dexter] Missing season or episode");
      return { streams: [] };
    }

    contentId = `${imdbId}:${season}:${episode}`;
  }

  const endpoint =
    `${DEXTER_BASE_URL}/stream/${type}/` +
    `${contentId}.json`;

  try {
    console.log("[Q08 Dexter] Request URL:", endpoint);

    const response = await fetch(endpoint, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.streams)) {
      console.log("[Q08 Dexter] Invalid stream response");
      return { streams: [] };
    }

    const streams = data.streams
      .filter(stream =>
        stream &&
        typeof stream.url === "string" &&
        /^https?:\/\//i.test(stream.url)
      )
      .map(stream => ({
        ...stream,
        name: stream.name || "Q08 Dexter",
        title: stream.title || "Q08 Dexter"
      }));

    console.log(
      "[Q08 Dexter] Streams returned:",
      streams.length
    );

    console.log(
      "[Q08 Dexter] Proxy streams:",
      streams.filter(s => s._mode === "proxy").length
    );

    console.log(
      "[Q08 Dexter] Direct streams:",
      streams.filter(s => s._mode === "direct").length
    );

    return { streams };

  } catch (error) {
    console.error(
      "[Q08 Dexter] Request failed:",
      error.message
    );

    return { streams: [] };
  }
}
