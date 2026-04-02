import express from "express";
import { addSkill, deleteSkill, getSkills, seedDefaults, updateSkill, updateTimer } from "../controllers/skillController.js";

const router = express.Router();

// Seed defaults on demand (optional)
router.post("/seed", async (_req, res, next) => {
  try {
    await seedDefaults();
    res.json({ message: "Defaults seeded" });
  } catch (err) {
    next(err);
  }
});

router.get("/", getSkills);
router.post("/", addSkill);
router.put("/:id", updateSkill);
router.delete("/:id", deleteSkill);
router.patch("/:id/timer", updateTimer);

export default router;
