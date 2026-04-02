import Attendance from "../models/Attendance.js";
import Skill from "../models/Skill.js";

const todayKey = () => new Date().toISOString().split("T")[0];

const calcStatus = (total, completed) => {
  if (total === 0) return "absent";
  if (completed === 0) return "absent";
  if (completed === total) return "present";
  return "partial";
};

export const computeToday = async (_req, res) => {
  const date = todayKey();
  const skills = await Skill.find();
  const totalSkills = skills.length;
  const completedSkills = skills.filter((s) => s.status === "completed").length;
  const status = calcStatus(totalSkills, completedSkills);
  const skillStatuses = skills.map((s) => ({ name: s.skillName, status: s.status === "completed" ? "completed" : "incomplete" }));

  const record = await Attendance.findOneAndUpdate(
    { date },
    { date, totalSkills, completedSkills, status, skills: skillStatuses },
    { new: true, upsert: true }
  );
  res.json(record);
};

export const listAttendance = async (_req, res) => {
  const items = await Attendance.find().sort({ date: -1 });
  res.json(items);
};

export const getByDate = async (req, res) => {
  const { date } = req.params;
  const item = await Attendance.findOne({ date });
  if (!item) return res.status(404).json({ message: "No attendance for date" });
  res.json(item);
};

export const resetSkillsForNewDay = async (_req, res) => {
  await Skill.updateMany({}, { status: "incomplete", elapsedTime: 0 });
  res.json({ message: "Skills reset for new day" });
};
