import { Router } from "express";
import { verifyAuth } from "../middleware/authMiddleware.js";
import { verifyAdmin } from "../middleware/adminMiddleware.js";
import { deleteUser, getUserProfileById, listUsers, resetStudentPassword, updateUserStatus } from "../controllers/adminController.js";

const router = Router();

router.get("/", verifyAuth, verifyAdmin, listUsers);
router.get("/:userId", verifyAuth, verifyAdmin, getUserProfileById);
router.delete("/:userId", verifyAuth, verifyAdmin, deleteUser);
router.patch("/:userId/status", verifyAuth, verifyAdmin, updateUserStatus);
router.patch("/:userId/password", verifyAuth, verifyAdmin, resetStudentPassword);

export default router;
