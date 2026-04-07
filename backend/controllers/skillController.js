import Skill from "../models/Skill.js";

const DEFAULT_SKILLS = [
  {
    skillName: "Learning",
    timerDuration: 30,
    defaultWebsites: ["https://www.geeksforgeeks.org", "https://developer.mozilla.org"],
  },
  {
    skillName: "Problem Solving",
    timerDuration: 45,
    defaultWebsites: ["https://leetcode.com", "https://www.codechef.com"],
  },
  {
    skillName: "Aptitude Practice",
    timerDuration: 30,
    defaultWebsites: ["https://www.indiabix.com", "https://prepinsta.com"],
  },
  {
    skillName: "Communication Practice",
    timerDuration: 10,
    defaultWebsites: [],
  },
  {
    skillName: "Coding Practice",
    timerDuration: 40,
    defaultWebsites: ["https://www.hackerrank.com", "https://leetcode.com"],
  },
];

const normalizeName = (name = "") => name.trim().toLowerCase();

const SKILLS_CACHE_TTL_MS = Number(process.env.SKILLS_CACHE_TTL_MS || 60000);
const skillsCache = new Map();

const cacheGet = (key) => {
  const cached = skillsCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    skillsCache.delete(key);
    return null;
  }
  return cached.value;
};

const cacheSet = (key, value, ttlMs = SKILLS_CACHE_TTL_MS) => {
  skillsCache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, Number(ttlMs) || 1),
  });
};

const clearSkillsCache = () => {
  skillsCache.clear();
};

export const seedDefaults = async () => {
  const count = await Skill.countDocuments();
  if (count > 0) return;
  await Skill.insertMany(DEFAULT_SKILLS);
  console.log("Inserted default skills");
};

export const getSkills = async (req, res) => {
  const search = String(req.query?.search || "").trim();
  const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query?.pageSize, 10) || 10, 1), 100);
  const useLegacyShape = !req.query?.page && !req.query?.pageSize && !search;

  const cacheKey = `skills::${search.toLowerCase()}::${page}::${pageSize}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return res.json(useLegacyShape ? cached.items : cached);
  }

  const query = search ? { skillName: { $regex: search, $options: "i" } } : {};
  const [total, items] = await Promise.all([
    Skill.countDocuments(query),
    Skill.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ]);

  const payload = {
    items,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };

  cacheSet(cacheKey, payload);
  return res.json(useLegacyShape ? items : payload);
};

export const addSkill = async (req, res) => {
  const { skillName, timerDuration, extraWebsites = [], defaultWebsites = [] } = req.body;
  if (!skillName) return res.status(400).json({ message: "Skill name is required" });

  const existing = await Skill.findOne({ skillName: new RegExp(`^${normalizeName(skillName)}$`, "i") });
  if (existing) return res.status(400).json({ message: "Skill already registered" });

  const skill = await Skill.create({
    skillName,
    timerDuration: Number(timerDuration) || 30,
    extraWebsites,
    defaultWebsites,
  });
  clearSkillsCache();
  res.status(201).json(skill);
};

export const updateSkill = async (req, res) => {
  const { id } = req.params;
  const { timerDuration, extraWebsites = [], defaultWebsites } = req.body;
  const updates = {};
  if (timerDuration !== undefined) updates.timerDuration = Number(timerDuration) || 0;
  if (extraWebsites) updates.extraWebsites = extraWebsites;
  if (defaultWebsites) updates.defaultWebsites = defaultWebsites;

  const skill = await Skill.findByIdAndUpdate(id, updates, { new: true });
  if (!skill) return res.status(404).json({ message: "Skill not found" });
  clearSkillsCache();
  res.json(skill);
};

export const deleteSkill = async (req, res) => {
  const { id } = req.params;
  const deleted = await Skill.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ message: "Skill not found" });
  clearSkillsCache();
  res.json({ message: "Skill deleted" });
};

export const updateTimer = async (req, res) => {
  const { id } = req.params;
  const { elapsedTime, status } = req.body;
  const updates = {};
  if (elapsedTime !== undefined) updates.elapsedTime = Number(elapsedTime) || 0;
  if (status) updates.status = status;

  const skill = await Skill.findByIdAndUpdate(id, updates, { new: true });
  if (!skill) return res.status(404).json({ message: "Skill not found" });
  clearSkillsCache();
  res.json(skill);
};
