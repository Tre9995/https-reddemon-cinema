
import express from "express";
import cors from "cors";
import {
  getCinemaStreams,
  getPlavioHDStreams,
  getCNCVerseStreams
} from "./providers.js";
import { getDexterStreams } from "./providers/dexter.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

const REDDEMON_LOGO =
  "https://raw.githubusercontent.com/Tre9995/https-reddemon-cinema/main/reddemon-log.png";

const TUBI_BASE_URL = "https://tubi-stremio.duckdns.org";

const NUVIO_SPORTS_BASE_URL =
  "https://nuviosports.xyz/eyJ0aW1lem9uZSI6IkFtZXJpY2EvTmFzc2F1In0";

// ==========================================
// BAHAMAS TV - ZNS-TV
// ==========================================

const ZNS_CHANNEL = {
  id: "bahamas:zns-tv",
  name: "ZNS-TV",
  url: "https://zns-edge1.streamcomedia.cloud/znstv13/zns1080p_stream/playlist.m3u8",
  description: "Bahamas national television"
};

// ==========================================
// US PLUTO TV
// ==========================================

const PLUTO_PLAYLIST_URL =
  "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_pluto.m3u";

let plutoChannelsCache = [];
let plutoChannelsCacheTime = 0;

async function getPlutoChannels() {
  const now = Date.now();

  if (
    plutoChannelsCache.length &&
    now - plutoChannelsCacheTime < 10 * 60 * 1000
  ) {
    return plutoChannelsCache;
  }

  const response = await fetch(PLUTO_PLAYLIST_URL, {
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(
      `US Pluto playlist request failed: ${response.status}`
    );
  }

  const playlist = await response.text();
  const lines = playlist.split(/\r?\n/);

  const channels = [];
  let pendingName = "";

  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      const comma = line.lastIndexOf(",");
      pendingName =
        comma >= 0 ? line.slice(comma + 1).trim() : "";

    } else if (
      pendingName &&
      line.trim().startsWith("http")
    ) {
      const url = line.trim();

      channels.push({
        id: "pluto:" + Buffer.from(url).toString("base64url"),
        name: pendingName,
        url,
        description: "US Pluto TV live channel"
      });

      pendingName = "";
    }
  }

  plutoChannelsCache = channels;
  plutoChannelsCacheTime = now;

  console.log(
    "[Live TV] Loaded US Pluto channels:",
    channels.length
  );

  return channels;
}

// ==========================================
// LIVE TV METADATA
// ==========================================

function liveChannelMeta(channel, country) {
  return {
    id: channel.id,
    type: "tv",
    name: channel.name,
    poster: REDDEMON_LOGO,
    background: REDDEMON_LOGO,
    description: channel.description,
    country,
    language: "English",
    genres: ["Live TV"],
    behaviorHints: {
      isLive: true
    }
  };
}

// ==========================================
// TUBI ADD-ON PROXY
// ==========================================

async function proxyTubiRequest(req, res) {
  try {
    const targetUrl = new URL(
      req.originalUrl,
      TUBI_BASE_URL
    );

    if (targetUrl.origin !== TUBI_BASE_URL) {
      return res.status(400).json({
        error: "Invalid Tubi request"
      });
    }

    const response = await fetch(targetUrl.toString(), {
      headers: {
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(30000)
    });

    const body = await response.text();

    res.status(response.status);
    res.set(
      "Content-Type",
      response.headers.get("content-type") ||
      "application/json"
    );

    return res.send(body);

  } catch (error) {
    console.error("[Tubi] Proxy error:", error.message);

    return res.status(502).json({
      error: "Tubi service is temporarily unavailable"
    });
  }
}

// ==========================================
// NUVIO LIVE SPORTS PROXY
// ==========================================

async function proxyNuvioSportsRequest(req, res) {
  try {
    const incomingUrl = new URL(req.originalUrl, "http://localhost");
    const targetUrl = NUVIO_SPORTS_BASE_URL + incomingUrl.pathname + incomingUrl.search;

    const response = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000)
    });

    const body = await response.text();

    res.status(response.status);
    res.set(
      "Content-Type",
      response.headers.get("content-type") || "application/json"
    );

    return res.send(body);

  } catch (error) {
    console.error("[Nuvio Sports] Proxy error:", error.message);

    return res.status(502).json({
      error: "Nuvio Sports service is temporarily unavailable"
    });
  }
}

// ==========================================
// PROVIDERS AND KIDS GENRE
// ==========================================

const NETFLIX_PROVIDER_ID = 8;
const DISNEY_PROVIDER_ID = 337;
const KIDS_TV_GENRE_ID = 10762;
const NETFLIX_REGION = "US";

// ==========================================
// FRANCHISE CATALOGUES
// ==========================================

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

// ==========================================
// EXTRA CATALOGUES
// ==========================================

const extraCatalogs = [
  {
    type: "movie",
    id: "kids-corner",
    name: "Kids Corner",
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"]
  },
  {
    type: "movie",
    id: "reddemon-christmas-movies",
    name: "Christmas Movies",
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"]
  },
  {
    type: "movie",
    id: "reddemon-thanksgiving-movies",
    name: "Thanksgiving Movies",
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"]
  },
  {
    type: "movie",
    id: "reddemon-easter-movies",
    name: "Easter Movies",
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"]
  },
  {
    type: "series",
    id: "reddemon-netflix-kids",
    name: "Netflix Kids",
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"]
  },
  {
    type: "series",
    id: "reddemon-disney-kids",
    name: "Disney+ Kids",
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"]
  },
  {
    type: "movie",
    id: "reddemon-netflix-movies",
    name: "Netflix Movies (US)",
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"]
  },
  {
    type: "series",
    id: "reddemon-netflix-series",
    name: "Netflix TV Shows (US)",
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"]
  },
  ...franchiseCatalogs.map(item => ({
    type: "movie",
    id: item.id,
    name: item.name,
    extra: [{ name: "skip", isRequired: false }],
    extraSupported: ["skip"]
  }))
];

// ==========================================
// NUVIO LIVE SPORTS - FLAT REPLAY CATALOGS
// ==========================================

const sportsReplayCatalogs = [
  ["nuvio_sports_replays", "🏆 Sports Replays"],
  ["nuvio_sports_replays_football", "⚽ Football Replays"],
  ["nuvio_sports_replays_football_today", "Football - Today's Replays"],
  ["nuvio_sports_replays_football_yesterday", "Football - Yesterday's Replays"],
  ["nuvio_sports_replays_football_this_week", "Football - This Week"],
  ["nuvio_sports_replays_football_older", "Football - Older Replays"],
  ["nuvio_sports_replays_football_nations_league", "Nations League"],
  ["nuvio_sports_replays_football_premier_league", "Premier League Replays"],
  ["nuvio_sports_replays_football_ucl", "Champions League Replays"],
  ["nuvio_sports_replays_football_recent", "Recent Football"],

  ["nuvio_sports_replays_motorsport", "🏎️ Motorsport Replays"],
  ["nuvio_sports_replays_motorsport_today", "Motorsport - Today's Races"],
  ["nuvio_sports_replays_motorsport_yesterday", "Motorsport - Yesterday's Races"],
  ["nuvio_sports_replays_motorsport_this_week", "Motorsport - This Week"],
  ["nuvio_sports_replays_motorsport_older", "Motorsport - Older Races"],
  ["nuvio_sports_replays_motorsport_f1", "Formula 1 Replays"],
  ["nuvio_sports_replays_motorsport_recent", "Recent Motorsport"],

  ["nuvio_sports_replays_baseball", "⚾ Baseball Replays"],
  ["nuvio_sports_replays_baseball_today", "Baseball - Today's Games"],
  ["nuvio_sports_replays_baseball_yesterday", "Baseball - Yesterday's Games"],
  ["nuvio_sports_replays_baseball_this_week", "Baseball - This Week"],
  ["nuvio_sports_replays_baseball_older", "Baseball - Older Games"],
  ["nuvio_sports_replays_baseball_mlb", "MLB Replays"],
  ["nuvio_sports_replays_baseball_recent", "Recent Baseball"],

  ["nuvio_sports_replays_rugby", "🏉 Rugby Replays"],
  ["nuvio_sports_replays_rugby_today", "Rugby - Today's Matches"],
  ["nuvio_sports_replays_rugby_yesterday", "Rugby - Yesterday's Matches"],
  ["nuvio_sports_replays_rugby_this_week", "Rugby - This Week"],
  ["nuvio_sports_replays_rugby_older", "Rugby - Older Matches"],
  ["nuvio_sports_replays_rugby_recent", "Recent Rugby"],

  ["nuvio_sports_replays_basketball", "🏀 Basketball Replays"],
  ["nuvio_sports_replays_basketball_today", "Basketball - Today's Games"],
  ["nuvio_sports_replays_basketball_yesterday", "Basketball - Yesterday's Games"],
  ["nuvio_sports_replays_basketball_this_week", "Basketball - This Week"],
  ["nuvio_sports_replays_basketball_older", "Basketball - Older Games"],
  ["nuvio_sports_replays_basketball_nba", "NBA Replays"],
  ["nuvio_sports_replays_basketball_recent", "Recent Basketball"],

  ["nuvio_sports_replays_tennis", "🎾 Tennis Replays"],
  ["nuvio_sports_replays_tennis_today", "Tennis - Today's Matches"],
  ["nuvio_sports_replays_tennis_yesterday", "Tennis - Yesterday's Matches"],
  ["nuvio_sports_replays_tennis_this_week", "Tennis - This Week"],
  ["nuvio_sports_replays_tennis_older", "Tennis - Older Matches"],
  ["nuvio_sports_replays_tennis_atp", "ATP Tour Replays"],
  ["nuvio_sports_replays_tennis_recent", "Recent Tennis"],

  ["nuvio_sports_replays_hockey", "🏒 Hockey Replays"],
  ["nuvio_sports_replays_hockey_today", "Hockey - Today's Games"],
  ["nuvio_sports_replays_hockey_yesterday", "Hockey - Yesterday's Games"],
  ["nuvio_sports_replays_hockey_this_week", "Hockey - This Week"],
  ["nuvio_sports_replays_hockey_older", "Hockey - Older Games"],
  ["nuvio_sports_replays_hockey_nhl", "NHL Replays"],
  ["nuvio_sports_replays_hockey_recent", "Recent Hockey"],

  ["nuvio_sports_replays_american_football", "🏈 American Football Replays"],
  ["nuvio_sports_replays_american_football_today", "NFL - Today's Games"],
  ["nuvio_sports_replays_american_football_yesterday", "NFL - Yesterday's Games"],
  ["nuvio_sports_replays_american_football_this_week", "NFL - This Week"],
  ["nuvio_sports_replays_american_football_older", "NFL - Older Games"],
  ["nuvio_sports_replays_american_football_nfl", "NFL Replays"],
  ["nuvio_sports_replays_american_football_recent", "Recent NFL"]
].map(([id, name]) => ({
  type: "tv",
  id,
  name,
  extra: [{ name: "skip", isRequired: true }],
  extraSupported: ["skip"]
}));

// ==========================================
// MANIFEST
// ==========================================

const manifest = {
  id: "org.reddemon.cinema",
  version: "0.7.3",
  name: "RedDemon Cinema",
  logo: REDDEMON_LOGO,
  description: "RedDemon Cinema movie and TV provider",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series", "tv"],
  catalogs: [
    {
      type: "tv",
      id: "bahamas-tv",
      name: "Bahamas TV",
      extra: [{ name: "skip", isRequired: false }],
      extraSupported: ["skip"]
    },
    {
      type: "tv",
      id: "us-pluto-tv",
      name: "US Pluto TV",
      extra: [{ name: "skip", isRequired: false }],
      extraSupported: ["skip"]
    },
    {
      type: "movie",
      id: "tubi-movies",
      name: "Tubi Movies",
      extra: [
        {
          name: "genre",
          options: [
            "2000s Comedy",
            "2000s Hits",
            "A&E",
            "A24",
            "Action",
            "Action Adventure",
            "Adult Animation",
            "Anime",
            "Arthouse Films",
            "Audio Description",
            "Back by Popular Demand",
            "Back To School",
            "Based on a Book",
            "Based on True Events",
            "Before They Were Stars",
            "Black Drama",
            "Black Independent Cinema",
            "Black Storytelling",
            "Blast From Awards Past",
            "Celebrate Hispanic Heritage",
            "CJ ENM Selects",
            "Classic TV & Movies",
            "Comedy",
            "CONtv",
            "Creatorverse",
            "Cult Classics",
            "Documentaries",
            "Docurama",
            "Double Features",
            "Dove Channel",
            "Drama",
            "DUST",
            "Edgy Comedy",
            "Family Franchise Faves",
            "Family Movies",
            "Featured",
            "FilmRise",
            "FOX",
            "FOX SOUL",
            "FOX Sports",
            "Franchise Fever",
            "Full Moon Features",
            "Gangster Movies",
            "Hallmark",
            "Have a Little Faith",
            "Hispanic Acting Icons",
            "Hispanic Leading Ladies",
            "Hispanic Storytellers",
            "Horror",
            "In Demand",
            "Indie Horror",
            "Indie Movies",
            "International Films",
            "K-Horror Nightmares",
            "Leaving Soon",
            "LGBTQ+ Storytelling",
            "Lifetime",
            "LOL! Network",
            "Martial Arts",
            "Martin Scorsese Essentials",
            "Modern Classics",
            "Most Popular",
            "Most Popular Action",
            "Most Popular Drama",
            "Most Popular Horror",
            "Movie Night",
            "Music",
            "Music & Concerts",
            "Must-See Hits",
            "Mystery",
            "Only Free on Tubi",
            "Podcasts",
            "Queen Latifah Energy",
            "Real Stories, Hispanic Voices",
            "Recently Added",
            "Recommended",
            "Romance",
            "Sci-fi & Fantasy",
            "Science & Nature",
            "Shout! Factory TV",
            "Something Completely Different",
            "Spooky Sci-Fi",
            "Sports Stories",
            "Spy Movies",
            "Stand Up Comedy",
            "Superheroes",
            "Terror on Tubi",
            "The YA Edit",
            "Thrillers",
            "Thrilling & Chilling",
            "TMZ Presents",
            "Top Searched",
            "Transformers Universe",
            "True Crime",
            "Tubi Originals",
            "TV One",
            "UNINTERRUPTED",
            "USA Top 50 Movies",
            "War Stories",
            "Westerns",
            "Witch, Please"
          ],
          isRequired: false
        },
        {
          name: "skip",
          isRequired: false
        }
      ],
      extraSupported: ["genre", "skip"]
    },
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
    },
    ...sportsReplayCatalogs
  ],
  idPrefixes: [
    "tt",
    "tmdb:",
    "bahamas:",
    "pluto:",
    "tubi:",
    "nuvio_sport_"
  ]
};

// ==========================================
// TMDB
// ==========================================

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

async function getTmdbIdFromImdb(imdbId, type) {
  console.log("[Stream] Looking up TMDB ID for:", imdbId);

  const data = await tmdb(
    `/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`
  );

  const result = type === "movie"
    ? data.movie_results?.[0]
    : data.tv_results?.[0];

  const tmdbId = result?.id ? String(result.id) : null;

  console.log("[Stream] TMDB ID resolved:", tmdbId);

  return tmdbId;
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

async function getFivePages(endpointBuilder, skip) {
  const firstPage = Math.floor(skip / 100) * 5 + 1;
  const offset = skip % 100;
  const requests = [];

  for (let i = 0; i < 5 && firstPage + i <= 500; i++) {
    requests.push(tmdb(endpointBuilder(firstPage + i)));
  }

  const pages = await Promise.all(requests);
  const results = pages.flatMap(data => data.results || []);

  return results.slice(offset, offset + 100);
}

// ==========================================
// CHRISTMAS KEYWORDS
// ==========================================

let christmasKeywordCache = null;

async function getChristmasKeywordIds() {
  if (christmasKeywordCache) {
    return christmasKeywordCache;
  }

  const data = await tmdb(
    "/search/keyword?query=christmas&page=1"
  );

  christmasKeywordCache = (data.results || [])
    .filter(item =>
      item.name.toLowerCase().includes("christmas")
    )
    .slice(0, 10)
    .map(item => item.id);

  return christmasKeywordCache;
}

// ==========================================
// THANKSGIVING AND EASTER KEYWORDS
// ==========================================

const holidayKeywordCache = {};

async function getHolidayKeywordIds(keyword) {
  if (holidayKeywordCache[keyword]) {
    return holidayKeywordCache[keyword];
  }

  const data = await tmdb(
    `/search/keyword?query=${encodeURIComponent(keyword)}&page=1`
  );

  const keywordIds = (data.results || [])
    .filter(item =>
      item.name.toLowerCase().includes(keyword.toLowerCase())
    )
    .slice(0, 10)
    .map(item => item.id);

  holidayKeywordCache[keyword] = keywordIds;

  return keywordIds;
}

// ==========================================
// CATALOG RESULTS
// ==========================================

async function getCatalogResults(type, catalogId, search, skip) {

  if (type === "tv" && catalogId === "bahamas-tv") {
    return [
      liveChannelMeta(ZNS_CHANNEL, "Bahamas")
    ].slice(skip, skip + 100);
  }

  if (type === "tv" && catalogId === "us-pluto-tv") {
    const channels = await getPlutoChannels();

    return channels
      .slice(skip, skip + 100)
      .map(channel =>
        liveChannelMeta(channel, "United States")
      );
  }

  const mediaType = convertType(type);

  const franchise = franchiseCatalogs.find(
    item => item.id === catalogId
  );

  if (catalogId === "kids-corner") {
    const results = await getFivePages(
      page =>
        `/discover/movie?with_genres=16,10751&certification_country=US&certification.lte=PG&sort_by=popularity.desc&page=${page}`,
      skip
    );

    return results.map(item => makeMeta(item, "movie"));
  }

  if (catalogId === "reddemon-christmas-movies") {
    const keywordIds = await getChristmasKeywordIds();

    if (!keywordIds.length) {
      return [];
    }

    const results = await getFivePages(
      page =>
        `/discover/movie?with_keywords=${keywordIds.join("|")}&sort_by=popularity.desc&page=${page}`,
      skip
    );

    return results.map(item => makeMeta(item, "movie"));
  }

  if (
    catalogId === "reddemon-thanksgiving-movies" ||
    catalogId === "reddemon-easter-movies"
  ) {
    const keyword =
      catalogId === "reddemon-thanksgiving-movies"
        ? "thanksgiving"
        : "easter";

    const keywordIds = await getHolidayKeywordIds(keyword);

    if (!keywordIds.length) {
      return [];
    }

    const results = await getFivePages(
      page =>
        `/discover/movie?with_keywords=${keywordIds.join("|")}&sort_by=popularity.desc&page=${page}`,
      skip
    );

    return results.map(item => makeMeta(item, "movie"));
  }

  if (
    catalogId === "reddemon-netflix-kids" ||
    catalogId === "reddemon-disney-kids"
  ) {
    const providerId =
      catalogId === "reddemon-netflix-kids"
        ? NETFLIX_PROVIDER_ID
        : DISNEY_PROVIDER_ID;

    const results = await getFivePages(
      page =>
        `/discover/tv?with_genres=${KIDS_TV_GENRE_ID}&watch_region=${NETFLIX_REGION}&with_watch_providers=${providerId}&with_watch_monetization_types=flatrate&sort_by=popularity.desc&page=${page}`,
      skip
    );

    return results.map(item => makeMeta(item, "series"));
  }

  if (catalogId === "reddemon-netflix-movies") {
    const results = await getFivePages(
      page =>
        `/discover/movie?watch_region=${NETFLIX_REGION}&with_watch_providers=${NETFLIX_PROVIDER_ID}&with_watch_monetization_types=flatrate&sort_by=popularity.desc&page=${page}`,
      skip
    );

    return results.map(item => makeMeta(item, "movie"));
  }

  if (catalogId === "reddemon-netflix-series") {
    const results = await getFivePages(
      page =>
        `/discover/tv?watch_region=${NETFLIX_REGION}&with_watch_providers=${NETFLIX_PROVIDER_ID}&with_watch_monetization_types=flatrate&sort_by=popularity.desc&page=${page}`,
      skip
    );

    return results.map(item => makeMeta(item, "series"));
  }

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

    const results = await getFivePages(
      page =>
        `/discover/movie?with_companies=${franchise.company}&sort_by=primary_release_date.asc&page=${page}`,
      skip
    );

    results.sort((a, b) =>
      (a.release_date || "9999").localeCompare(
        b.release_date || "9999"
      )
    );

    return results.map(item => makeMeta(item, "movie"));
  }

  const results = await getFivePages(
    page => {
      if (search) {
        return `/search/${mediaType}?query=${encodeURIComponent(search)}&page=${page}`;
      }

      return `/${mediaType}/popular?page=${page}`;
    },
    skip
  );

  return results.map(item => makeMeta(item, type));
}

// ==========================================
// CATALOG EXTRAS
// ==========================================

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

// ==========================================
// BASIC ROUTES
// ==========================================

app.get("/", (req, res) => {
  res.json({
    name: "RedDemon Cinema",
    status: "online"
  });
});

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

// ==========================================
// TEMPORARY Q08 DEXTER DIAGNOSTIC ROUTE
// ==========================================

app.get("/test-dexter/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;

    console.log("[Dexter Test] Request:", type, id);

    if (!["movie", "series"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Unsupported content type"
      });
    }

    const result = await getDexterStreams(type, id);

    const streams = result?.streams || [];

    console.log(
      "[Dexter Test] Streams returned:",
      streams.length
    );

    res.json({
      success: true,
      provider: "Q08 Dexter",
      type,
      id,
      streamCount: streams.length,
      diagnostics: result?.diagnostics || null,
      streams
    });

  } catch (error) {
    console.error("[Dexter Test] Error:", error.message);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// CATALOG ROUTE
// ==========================================

app.get(
  /^\/catalog\/([^/]+)\/([^/]+)(?:\/(.*))?\.json$/,
  async (req, res) => {
    try {
      const type = req.params[0];

      if (!["movie", "series", "tv"].includes(type)) {
        return res.json({ metas: [] });
      }

      const catalogId = req.params[1];

      if (catalogId === "tubi-movies") {
        return await proxyTubiRequest(req, res);
      }

      if (catalogId.startsWith("nuvio_sports_replays")) {
        return await proxyNuvioSportsRequest(req, res);
      }

      const { search, skip } = getCatalogExtras(req);

      const metas = await getCatalogResults(
        type,
        catalogId,
        search,
        skip
      );

      res.json({ metas });

    } catch (error) {
      console.error("Catalog error:", error.message);
      res.status(502).json({ metas: [] });
    }
  }
);

// ==========================================
// METADATA ROUTE
// ==========================================

app.get("/meta/:type/:id.json", async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type === "movie" && id.startsWith("tubi:")) {
      return await proxyTubiRequest(req, res);
    }

    if (type === "tv" && id.startsWith("nuvio_sport_")) {
      return await proxyNuvioSportsRequest(req, res);
    }

    if (type === "tv") {

      if (id === ZNS_CHANNEL.id) {
        return res.json({
          meta: liveChannelMeta(ZNS_CHANNEL, "Bahamas")
        });
      }

      if (id.startsWith("pluto:")) {
        const channels = await getPlutoChannels();

        const channel = channels.find(
          item => item.id === id
        );

        if (channel) {
          return res.json({
            meta: liveChannelMeta(channel, "United States")
          });
        }
      }

      return res.status(404).json({
        error: "Live channel not found"
      });
    }

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
    console.error("Metadata error:", error.message);

    res.status(502).json({
      error: "Metadata unavailable"
    });
  }
});

// ==========================================
// STREAM ROUTE
// HdHub + Q08 Dexter + PlavioHD + CNCVerse + Tubi + Live TV
// ==========================================

app.get("/stream/:type/:id.json", async (req, res) => {
  try {
    const { type } = req.params;
    let id = req.params.id;

    console.log("[Stream] Incoming request:", type, id);

    if (type === "movie" && id.startsWith("tubi:")) {
      return await proxyTubiRequest(req, res);
    }

    if (type === "tv" && id.startsWith("nuvio_sport_")) {
      return await proxyNuvioSportsRequest(req, res);
    }

    if (type === "tv") {

      if (id === ZNS_CHANNEL.id) {
        return res.json({
          streams: [{
            name: "ZNS-TV",
            description: "Bahamas national television - Live",
            url: ZNS_CHANNEL.url
          }]
        });
      }

      if (id.startsWith("pluto:")) {
        const channels = await getPlutoChannels();

        const channel = channels.find(
          item => item.id === id
        );

        if (channel) {
          return res.json({
            streams: [{
              name: channel.name,
              description: "US Pluto TV - Live",
              url: channel.url
            }]
          });
        }
      }

      return res.json({ streams: [] });
    }

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

      if (!season || !episode) {
        console.log("[Stream] Missing season or episode");
        return res.json({ streams: [] });
      }
    }

    let tmdbId = null;
    let imdbId = null;

    if (id.startsWith("tmdb:")) {
      tmdbId = id.replace(/^tmdb:/, "");

      if (!/^\d+$/.test(tmdbId)) {
        return res.json({ streams: [] });
      }

      const mediaType = convertType(type);

      const details = await tmdb(
        `/${mediaType}/${tmdbId}?append_to_response=external_ids`
      );

      imdbId = details.external_ids?.imdb_id || null;

      console.log("[Stream] IMDb ID from TMDB:", imdbId);

    } else if (id.startsWith("tt")) {
      imdbId = id;
      tmdbId = await getTmdbIdFromImdb(imdbId, type);

    } else {
      console.log("[Stream] Unsupported ID:", id);
      return res.json({ streams: [] });
    }

    console.log("[Stream] Resolved IDs:", {
      imdbId,
      tmdbId,
      season,
      episode
    });

    const providerId =
      type === "series"
        ? `${imdbId || id}:${season}:${episode}`
        : imdbId || id;

    const results = await Promise.allSettled([
      imdbId
        ? getCinemaStreams(type, providerId)
        : Promise.resolve({ streams: [] }),

      imdbId
        ? getDexterStreams(type, imdbId, season, episode)
        : Promise.resolve({ streams: [] }),

      imdbId
        ? getPlavioHDStreams(type, imdbId, season, episode)
        : Promise.resolve({ streams: [] }),

      imdbId
        ? getCNCVerseStreams(type, providerId)
        : Promise.resolve({ streams: [] })
    ]);

    const streams = [];

    const providerNames = [
      "HdHub",
      "Q08 Dexter",
      "PlavioHD",
      "CNCVerse"
    ];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];

      if (result.status === "fulfilled") {
        const providerStreams = result.value?.streams || [];

        console.log(
          `[Stream] ${providerNames[i]} returned ${providerStreams.length} streams`
        );

        streams.push(...providerStreams);

      } else {
        console.error(
          `[Stream] ${providerNames[i]} failed:`,
          result.reason?.message || result.reason
        );
      }
    }

    const uniqueStreams = [
      ...new Map(
        streams
          .filter(stream => stream?.url)
          .map(stream => [stream.url, stream])
      ).values()
    ];

    console.log(
      "[Stream] Total unique streams:",
      uniqueStreams.length
    );

    res.json({ streams: uniqueStreams });

  } catch (error) {
    console.error(
      "[Stream] Cinema stream error:",
      error.message
    );

    res.status(502).json({
      streams: [],
      error: "Could not retrieve Cinema streams"
    });
  }
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(`RedDemon Cinema running on port ${PORT}`);
});
