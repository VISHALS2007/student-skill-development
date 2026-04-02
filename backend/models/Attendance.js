import mongoose from "mongoose";

const SkillStatusSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    status: { type: String, enum: ["completed", "incomplete"], default: "incomplete" },
  },
  { _id: false }
);

const AttendanceSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true }, // ISO date YYYY-MM-DD
    totalSkills: { type: Number, default: 0 },
    completedSkills: { type: Number, default: 0 },
    status: { type: String, enum: ["present", "partial", "absent"], default: "absent" },
    skills: { type: [SkillStatusSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Attendance", AttendanceSchema);
