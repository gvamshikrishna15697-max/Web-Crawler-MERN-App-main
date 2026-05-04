import express from "express";
import Article from "../models/Article.js";
import { readSnapshotIfExists, writeArticlesSnapshot } from "../scraper/snapshot.js";

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const {
      from,
      to,
      locale,
      source,
      q,
      page = "1",
      limit = "50",
      sort = "pubDateDesc",
    } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

    const filter = {};
    if (from || to) {
      filter.pubDate = {};
      if (from) filter.pubDate.$gte = new Date(String(from));
      if (to) filter.pubDate.$lt = new Date(String(to));
    }
    if (locale) filter.locale = String(locale);
    if (source) filter.source = String(source);
    if (q) filter.title = { $regex: String(q), $options: "i" };

    const sortMap = {
      pubDateDesc: { pubDate: -1, createdAt: -1 },
      pubDateAsc: { pubDate: 1, createdAt: 1 },
      createdDesc: { createdAt: -1 },
    };

    const sortObj = sortMap[String(sort)] ?? sortMap.pubDateDesc;

    const [items, total] = await Promise.all([
      Article.find(filter)
        .sort(sortObj)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Article.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/export.json", async (req, res, next) => {
  try {
    const snapshot = await readSnapshotIfExists();
    if (snapshot) return res.json(snapshot);

    const generated = await writeArticlesSnapshot({
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
    });
    return res.json(generated);
  } catch (err) {
    next(err);
  }
});

export default router;

