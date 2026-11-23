
const MANIFEST_URL = process.env.HDHUB_MANIFEST_URL;
const PLAVIOHD_MANIFEST_URL = process.env.PLAVIOHD_BASE_URL;

async function fetchAddonStreams(manifestUrl, type, id, providerName) {
  if (!manifestUrl) {
    throw new Error(`${providerName}_MANIFEST_URL is not configured`);
  }

  if (!["movie", "series"].includes(type)) {
    throw new Error("Unsupported content type");
  }

  const cleanManifestUrl = manifestUrl.trim();

  const manifestResponse = await fetch(cleanManifestUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25000)
  });

  if (!manifestResponse.ok) {
    throw new Error(
      `${providerName} manifest request failed: ${manifestResponse.status}`
    );
  }

  const manifest = await manifestResponse.json();

  const hasStreamResource =
    Array.isArray(manifest.resources) &&
    manifest.resources.some(resource =>
      resource === "stream" || resource?.name === "stream"
    );

  if (!hasStreamResource) {
    throw new Error(`${providerName} does not advertise stream support`);
  }

  const baseUrl = cleanManifestUrl.replace(
    /\/manifest\.json(?:\?.*)?$/i,
    ""
  );

  // Preserve the colons in series IDs (IMDb:season:episode).
  const encodedId = encodeURIComponent(id).replace(/%3A/gi, ":");

  const streamUrl =
    `${baseUrl}/stream/${encodeURIComponent(type)}/${encodedId}.json`;

  console.log(`[${providerName}] Requesting:`, streamUrl);

  const response = await fetch(streamUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(
      `${providerName} stream request failed: ${response.status}`
    );
  }

  const data = await response.json();

  const streams = Array.isArray(data?.streams)
    ? data.streams
    : [];

  console.log(`[${providerName}] Streams returned:`, streams.length);

  return { streams };
}

// HDHUB PROVIDER
export async function getCinemaStreams(type, id) {
  return fetchAddonStreams(
    MANIFEST_URL,
    type,
    id,
    "HdHub"
  );
}

// PLAVIOHD PROVIDER
export async function getPlavioHDStreams(type, id, season, episode) {
  let streamId = id;

  if (type === "series") {
    if (!season || !episode) {
      return { streams: [] };
    }

    streamId = `${id}:${season}:${episode}`;
  }

  return fetchAddonStreams(
    PLAVIOHD_MANIFEST_URL,
    type,
    streamId,
    "PlavioHD"
  );
}
