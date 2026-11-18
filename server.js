
import express from "express";
import cors from "cors";
import { getCinemaStreams } from "./providers.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

// Separate movie franchise catalogues
const franchiseCatalogs = [
  { id: "franchise-marvel", name: "Marvel Movies", company: 420 },
  { id: "franchise-dc", name: "DC Movies", company: 9993 },
  { id: "franchise-harry-potter", name: "Harry Potter", collection: 1241 },
  { id: "franchise-fast-furious", name: "Fast & Furious", collection: 9485 },
  { id: "franchise-jurassic-park", name: "Jurassic Park", collection: 328 },
  { id: "franchise-transformers", name: "Transformers", collection: 8650 },
  { id: "franchise-toy-story", name: "Toy Story", collection: 10194 },
  { id: "franchise-shrek", name: "Shrek", collection: 2150 },
  { id: "franchise-ice-age", name: "Ice Age", collection: 8354 },
  { id: "franchise-pirates", name: "Pirates of the Caribbean", collection: 295 },
  { id: "franchise-final-destination", name: "Final Destination", collection: 8864 },
  { id: "franchise-die-hard", name: "Die Hard", collection: 1570 }
];

const extraCatalogs = [
  {
    type: "movie",
    id: "kids-corner",
    name: "Kids Corner",
    extra: [
      { name: "skip", isRequired: false }
    ],
    extraSupported: ["skip"]
  },
  ...franchiseCatalogs.map(item => ({
    type: "movie",
    id: item.id,
    name: item.name,
    extra: [
      { name: "skip", isRequired: false }
    ],
    extraSupported: ["skip"]
  }))
];

const manifest = {
  id: "org.reddemon.cinema",
  version: "0.4.0",
  name: "RedDemon Cinema",
  description: "RedDemon Cinema movie and TV provider",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],
  catalogs: [
    ...extraCatalogs,
    {
      type: "movie",
      id: "reddemon-cinema-movies",
      name: "RedDemon Cinema Movies",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ],
      extraSupported: ["search", "skip"]
    },
    {
      type: "series",
      id: "reddemon-cinema-series",
      name: "RedDemon Cinema Series",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ],
      extraSupported: ["search", "skip"]
    }
  ],
  idPrefixes: ["tt", "tmdb:"]
};

async function tmdb(path) {
  if (!TMDB_KEY) {
    throw new Error("TMDB_API_KEY is not configured");
  }

  const separator = path.includes("?") ? "&" : "?";

  const response = await fetch(
    `${TMDB_BASE}${path}${separator}api_key=${encodeURIComponent(TMDB_KEY)}`
  );

  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status}`);
  }

  return response.json();
}

function convertType(type) {
  return type === "series" ? "tv" : "movie";
}

function makeMeta(item, type) {
  return {
    id: `tmdb:${item.id}`,
    type,
    name: item.title || item.name || "Unknown title",
    poster: item.poster_path
      ? `${IMAGE_BASE}${item.poster_path}`
      : undefined,
    background: item.backdrop_path
      ? `${IMAGE_BASE}${item.backdrop_path}`
      : undefined,
    description: item.overview || "",
    releaseInfo: (
      item.release_date || item.first_air_date || ""
    ).slice(0, 4)
  };
}

// Catalogue results
async function getCatalogResults(type, catalogId, search, skip) {
  const mediaType = convertType(type);

  const franchise = franchiseCatalogs.find(
    item => item.id === catalogId
  );

  // Kids Corner: animated and family-friendly movies
  if (catalogId === "kids-corner") {
    const firstPage = Math.floor(skip / 100) * 5 + 1;
    const offset = skip % 100;
    const requests = [];

    for (let i = 0; i < 5 && firstPage + i <= 500; i++) {
      requests.push(
        tmdb(
          `/discover/movie?with_genres=16,10751&certification_country=US&certification.lte=PG&sort_by=popularity.desc&page=${firstPage + i}`
        )
      );
    }

    const results = (
      await Promise.all(requests)
    ).flatMap(data => data.results || []);

    return results
      .slice(offset, offset + 100)
      .map(item => makeMeta(item, "movie"));
  }

  // Individual movie franchises
  if (franchise) {
    if (franchise.collection) {
      const data = await tmdb(
        `/collection/${franchise.collection}`
      );

      const results = (data.parts || []).slice();

      results.sort((a, b) =>
        (a.release_date || "9999").localeCompare(
          b.release_date || "9999"
        )
      );

      return results
        .slice(skip, skip + 100)
        .map(item => makeMeta(item, "movie"));
    }

    // Company-based franchises
    const firstPage = Math.floor(skip / 100) * 5 + 1;
    const requests = [];

    for (let i = 0; i < 5 && firstPage + i <= 500; i++) {
      requests.push(
        tmdb(
          `/discover/movie?with_companies=${franchise.company}&sort_by=primary_release_date.asc&page=${firstPage + i}`
        )
      );
    }

    const results = (
      await Promise.all(requests)
    ).flatMap(data => data.results || []);

    results.sort((a, b) =>
      (a.release_date || "9999").localeCompare(
        b.release_date || "9999"
      )
    );

    return results
      .slice(skip % 100, (skip % 100) + 100)
      .map(item => makeMeta(item, "movie"));
  }

  // Main movie and TV catalogues
  const firstPage = Math.floor(skip / 100) * 5 + 1;
  const offset = skip % 100;
  const requests = [];

  for (let i = 0; i < 5 && firstPage + i <= 500; i++) {
    const page = firstPage + i;

    const endpoint = search
      ? `/search/${mediaType}?query=${encodeURIComponent(search)}&page=${page}`
      : `/${mediaType}/popular?page=${page}`;

    requests.push(tmdb(endpoint));
  }

  const results = (
    await Promise.all(requests)
  ).flatMap(data => data.results || []);

  return results
    .slice(offset, offset + 100)
    .map(item => makeMeta(item, type));
}

function getCatalogExtras(req) {
  const extraPath = req.params[2] || "";
  const pathExtras = new URLSearchParams(extraPath);

  const search =
    req.query.search ||
    pathExtras.get("search") ||
    "";

  const rawSkip =
    req.query.skip ??
    pathExtras.get("skip") ??
    0;

  const skip = Math.max(0, Number(rawSkip) || 0);

  return { search, skip };
}

// Home
app.get("/", (req, res) => {
  res.json({
    name: "RedDemon Cinema",
    status: "online"
  });
});

// Manifest
app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

// Catalogue routes
app.get(
  /^\/catalog\/([^/]+)\/([^/]+)(?:\/(.*))?\.json$/,
  async (req, res) => {
    try {
      const type = req.params[0];

      if (!["movie", "series"].includes(type)) {
        return res.json({ metas: [] });
      }

      const catalogId = req.params[1];
      const { search, skip } = getCatalogExtras(req);

      const metas = await getCatalogResults(
        type,
        catalogId,
        search,
        skip
      );

      res.json({ metas });
    } catch (error) {
      console.error("TMDB catalog error:", error.message);
      res.status(502).json({ metas: [] });
    }
  }
);

// Metadata
app.get("/meta/:type/:id.json", async (req, res) => {
  try {
    const { type, id } = req.params;
    const tmdbId = id.replace(/^tmdb:/, "");

    if (
      !["movie", "series"].includes(type) ||
      !/^\d+$/.test(tmdbId)
    ) {
      return res.status(400).json({
        error: "Invalid metadata ID"
      });
    }

    const mediaType = convertType(type);

    const data = await tmdb(
      `/${mediaType}/${tmdbId}?append_to_response=external_ids`
    );

    res.json({
      meta: {
        ...makeMeta(data, type),
        imdb_id: data.external_ids?.imdb_id
      }
    });
  } catch (error) {
    console.error("TMDB metadata error:", error.message);

    res.status(502).json({
      error: "Metadata unavailable"
    });
  }
});

// Streaming
app.get("/stream/:type/:id.json", async (req, res) => {
  try {
    const { type } = req.params;
    let id = req.params.id;

    if (!["movie", "series"].includes(type)) {
      return res.json({ streams: [] });
    }

    let season;
    let episode;

    if (type === "series") {
      const match = id.match(/^(.*):(\d+):(\d+)$/);

      if (match) {
        id = match[1];
        season = match[2];
        episode = match[3];
      }
    }

    if (id.startsWith("tmdb:")) {
      const tmdbId = id.replace(/^tmdb:/, "");
      const mediaType = convertType(type);

      const details = await tmdb(
        `/${mediaType}/${tmdbId}?append_to_response=external_ids`
      );

      id = details.external_ids?.imdb_id;

      if (!id) {
        return res.json({ streams: [] });
      }
    }

    if (!id.startsWith("tt")) {
      return res.json({ streams: [] });
    }

    const providerId =
      type === "series" && season && episode
        ? `${id}:${season}:${episode}`
        : id;

    const result = await getCinemaStreams(type, providerId);

    res.json(result);
  } catch (error) {
    console.error("Cinema stream error:", error.message);

    res.status(502).json({
      streams: [],
      error: "Could not retrieve Cinema streams"
    });
  }
});

app.listen(PORT, () => {
  console.log(`RedDemon Cinema running on port ${PORT}`);
});
