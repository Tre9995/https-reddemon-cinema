
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

const manifest = {
  id: "org.reddemon.cinema",
  version: "0.2.0",
  name: "RedDemon Cinema",
  description: "RedDemon Cinema movie and TV provider",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],
  catalogs: [
    {
      type: "movie",
      id: "reddemon-cinema-movies",
      name: "RedDemon Cinema Movies",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    },
    {
      type: "series",
      id: "reddemon-cinema-series",
      name: "RedDemon Cinema Series",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
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

app.get("/", (req, res) => {
  res.json({
    name: "RedDemon Cinema",
    status: "online"
  });
});

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

app.get("/catalog/:type/:id.json", async (req, res) => {
  try {
    const { type } = req.params;

    if (!["movie", "series"].includes(type)) {
      return res.json({ metas: [] });
    }

    const mediaType = convertType(type);
    const search = req.query.search;
    const skip = Math.max(0, Number(req.query.skip) || 0);
    const page = Math.floor(skip / 20) + 1;

    const endpoint = search
      ? `/search/${mediaType}?query=${encodeURIComponent(search)}&page=${page}`
      : `/${mediaType}/popular?page=${page}`;

    const data = await tmdb(endpoint);

    res.json({
      metas: (data.results || []).map(item =>
        makeMeta(item, type)
      )
    });
  } catch (error) {
    console.error("TMDB catalog error:", error.message);
    res.status(502).json({ metas: [] });
  }
});

app.get("/meta/:type/:id.json", async (req, res) => {
  try {
    const { type, id } = req.params;
    const tmdbId = id.replace(/^tmdb:/, "");

    if (!["movie", "series"].includes(type) || !/^\d+$/.test(tmdbId)) {
      return res.status(400).json({ error: "Invalid metadata ID" });
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
    res.status(502).json({ error: "Metadata unavailable" });
  }
});

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
