
const MANIFEST_URL = process.env.HDHUB_MANIFEST_URL;

export async function getCinemaStreams(type, id) {
  if (!MANIFEST_URL) {
    throw new Error("HDHUB_MANIFEST_URL is not configured");
  }

  if (!["movie", "series"].includes(type)) {
    throw new Error("Unsupported content type");
  }

  const manifestResponse = await fetch(MANIFEST_URL);

  if (!manifestResponse.ok) {
    throw new Error("Could not connect to HdHub");
  }

  const manifest = await manifestResponse.json();

  if (!manifest.resources?.includes("stream")) {
    throw new Error("HdHub does not provide streams");
  }

  const baseUrl = MANIFEST_URL.replace(/\/manifest\.json$/, "");
  const streamUrl =
    `${baseUrl}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`;

  const response = await fetch(streamUrl);

  if (!response.ok) {
    throw new Error("HdHub stream request failed");
  }

  const data = await response.json();

  return {
    streams: Array.isArray(data.streams) ? data.streams : []
  };
}
