import mongoose from "mongoose";

const scrapeRunSchema = new mongoose.Schema(
  {
    trigger: { type: String, enum: ["manual", "cron"], required: true },
    status: { type: String, enum: ["success", "error"], required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    stats: { type: Object, default: {} },
    snapshot: { type: Object, default: {} },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.model("ScrapeRun", scrapeRunSchema);

