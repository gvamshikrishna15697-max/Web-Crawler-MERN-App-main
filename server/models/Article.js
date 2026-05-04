import mongoose from "mongoose";

const articleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    source: { type: String, default: "", trim: true },
    locale: { type: String, default: "", trim: true },
    url: { type: String, required: true, unique: true, index: true, trim: true },
    pubDate: { type: Date },
    pubDateText: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

export default mongoose.model("Article", articleSchema);

