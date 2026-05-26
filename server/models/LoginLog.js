import mongoose from "mongoose";

const loginLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    success: { type: Boolean, required: true, index: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    failureReason: { type: String, default: "" },
  },
  { timestamps: true },
);

loginLogSchema.index({ createdAt: -1 });

export default mongoose.model("LoginLog", loginLogSchema);
