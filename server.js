
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const manifest = {
  id: "org.reddemon.cinema",
  version: "0.1.0",
  name: "RedDemon Cinema",
  description: "RedDemon Cinema standalone movie and TV provider",
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

app.get("/", (req, res) => {
  res.json({
    name: "RedDemon Cinema",
    status: "online"
  });
});

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

app.get("/catalog/:type/:id.json", (req, res) => {
  res.json({ metas: [] });
});

app.get("/meta/:type/:id.json", (req, res) => {
  res.status(404).json({
    error: "Metadata not found"
  });
});

app.get("/stream/:type/:id.json", (req, res) => {
  res.json({ streams: [] });
});

app.listen(PORT, () => {
  console.log(`RedDemon Cinema running on port ${PORT}`);
});
