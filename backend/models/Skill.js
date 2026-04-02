import mongoose from "mongoose";

const SkillSchema = new mongoose.Schema(
  {
    skillName: { type: String, required: true, unique: true, trim: true },
    timerDuration: { type: Number, required: true, default: 30 },
    elapsedTime: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["incomplete", "running", "paused", "completed"],
      default: "incomplete",
    },
    defaultWebsites: { type: [String], default: [] },
    extraWebsites: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

export default mongoose.model("Skill", SkillSchema);
