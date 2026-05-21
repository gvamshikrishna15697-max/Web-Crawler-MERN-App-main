import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Article from "../models/Article.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SNAPSHOT_PATH = path.resolve(__dirname, "..", "data", "articles.snapshot.json");

export async function writeArticlesSnapshot({
  from,
  to,
  maxItems = 5000,
} = {}) {
  const filter = {};

  if (from || to) {
    filter.pubDate = {};
    if (from) filter.pubDate.$gte = new Date(from);
    if (to) filter.pubDate.$lt = new Date(to);
  }

  const items = await Article.find(filter)
    .sort({ pubDate: -1, createdAt: -1 })
    .limit(maxItems)
    .lean();

  const payload = {
    generatedAt: new Date().toISOString(),
    count: items.length,
    items,
  };

  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  const tmpPath = `${SNAPSHOT_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.rename(tmpPath, SNAPSHOT_PATH);

  return payload;
}

export async function readSnapshotIfExists() {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

