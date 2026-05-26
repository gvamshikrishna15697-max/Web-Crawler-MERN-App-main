import express from "express";
import rateLimit from "express-rate-limit";
import {
  createUserAdmin,
  login,
  logout,
  me,
} from "../controllers/authController.js";
import { requireAdminToken } from "../middleware/adminAuth.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "TooManyRequests",
    message: "Too many auth attempts. Try again later.",
  },
});

router.post("/login", authLimiter, login);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);
/** Create users manually — requires ADMIN_TOKEN (not exposed in the public UI). */
router.post("/admin/users", authLimiter, requireAdminToken, createUserAdmin);

export default router;
