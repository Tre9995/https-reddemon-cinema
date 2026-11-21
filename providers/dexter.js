
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
  const diagnostics = {
    provider: "Q08 Dexter",
    status: null,
    contentType: null,
    endpoint: null,
    streamCount: 0,
    error: null
  };

  try {
    if (!["movie", "series"].includes(type)) {
      throw new Error("Unsupported content type: " + type);
    }

    if (!imdbId || !imdbId.startsWith("tt")) {
      throw new Error("Valid IMDb ID required");
    }

    let contentId = imdbId;

    if (type === "series") {
      if (season == null || episode == null) {
        throw new Error("Missing season or episode");
      }

      contentId = `${imdbId}:${season}:${episode}`;
    }

    const endpoint =
      `${DEXTER_BASE_URL}/stream/${type}/${contentId}.json`;

    diagnostics.endpoint = endpoint;

    console.log("[Q08 Dexter] Request:", endpoint);

    const response = await fetch(endpoint, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(30000)
    });

    diagnostics.status = response.status;
    diagnostics.contentType =
      response.headers.get("content-type");

    console.log("[Q08 Dexter] HTTP status:", response.status);
    console.log(
      "[Q08 Dexter] Content type:",
      diagnostics.contentType
    );

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Dexter HTTP ${response.status}: ${responseText.slice(0, 500)}`
      );
    }

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        "Dexter did not return valid JSON: " +
        responseText.slice(0, 500)
      );
    }

    if (!Array.isArray(data.streams)) {
      throw new Error(
        "No streams array in Dexter response: " +
        responseText.slice(0, 500)
      );
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

    diagnostics.streamCount = streams.length;

    console.log(
      "[Q08 Dexter] Valid streams:",
      diagnostics.streamCount
    );

    return {
      streams,
      diagnostics
    };

  } catch (error) {
    diagnostics.error = error.message;

    console.error(
      "[Q08 Dexter] Diagnostic failure:",
      error.message
    );

    return {
      streams: [],
      diagnostics
    };
  }
}
