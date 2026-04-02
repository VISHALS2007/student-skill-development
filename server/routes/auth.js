import { Router } from "express";
import { adminLogin } from "../controllers/adminController.js";

const router = Router();

// POST /admin/login
router.post("/login", adminLogin);

export default router;
