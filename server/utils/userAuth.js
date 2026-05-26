import bcrypt from "bcryptjs";
import User from "../models/User.js";
import LoginLog from "../models/LoginLog.js";

export const BCRYPT_ROUNDS = 12;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

export function publicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
  };
}

export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "";
}

export function recordLoginAttempt({
  userId = null,
  username,
  success,
  req,
  failureReason = "",
}) {
  void LoginLog.create({
    userId,
    username: String(username || "").toLowerCase(),
    success,
    ip: clientIp(req),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 512),
    failureReason: failureReason ? String(failureReason).slice(0, 200) : "",
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to write login log:", err?.message || err);
  });
}

export function validateNewUser({ username, password, email }) {
  const errors = [];
  const normalizedUsername = String(username || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");
  const rawEmail = String(email || "").trim().toLowerCase();
  const normalizedEmail = rawEmail || `${normalizedUsername}@users.internal`;

  if (!USERNAME_RE.test(normalizedUsername)) {
    errors.push(
      "Username must be 3–32 characters: lowercase letters, numbers, underscore.",
    );
  }
  if (rawEmail && !EMAIL_RE.test(rawEmail)) {
    errors.push("A valid email address is required.");
  }
  if (normalizedPassword.length < 8) {
    errors.push("Password must be at least 8 characters.");
  }

  return {
    ok: errors.length === 0,
    errors,
    username: normalizedUsername,
    password: normalizedPassword,
    email: normalizedEmail,
  };
}

export async function createAppUser({ username, password, email }) {
  const validated = validateNewUser({ username, password, email });
  if (!validated.ok) {
    const err = new Error(validated.errors.join(" "));
    err.status = 400;
    err.code = "ValidationError";
    throw err;
  }

  const passwordHash = await bcrypt.hash(validated.password, BCRYPT_ROUNDS);

  try {
    const user = await User.create({
      username: validated.username,
      email: validated.email,
      passwordHash,
      isActive: true,
    });
    return user;
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "field";
      const dup = new Error(`A user with that ${field} already exists.`);
      dup.status = 409;
      dup.code = "Conflict";
      throw dup;
    }
    throw err;
  }
}
