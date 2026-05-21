import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { signAccessToken } from "../utils/jwt.js";

const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

function publicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function validationError(res, message) {
  return res.status(400).json({ error: "ValidationError", message });
}

export async function signup(req, res, next) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const username = String(body.username || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    const rawEmail = String(body.email || "").trim().toLowerCase();
    const email = rawEmail || `${username}@users.internal`;

    if (!USERNAME_RE.test(username)) {
      return validationError(
        res,
        "Username must be 3–32 characters: lowercase letters, numbers, underscore.",
      );
    }
    if (rawEmail && !EMAIL_RE.test(rawEmail)) {
      return validationError(res, "A valid email address is required.");
    }
    if (password.length < 8) {
      return validationError(res, "Password must be at least 8 characters.");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    let user;
    try {
      user = await User.create({ username, email, passwordHash });
    } catch (err) {
      if (err?.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0] || "field";
        return res.status(409).json({
          error: "Conflict",
          message: `A user with that ${field} already exists.`,
        });
      }
      throw err;
    }

    const token = signAccessToken(user);
    return res.status(201).json({
      token,
      user: publicUser(user),
    });
  } catch (err) {
    return next(err);
  }
}

export async function login(req, res, next) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const identifier = String(body.identifier || body.email || body.username || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");

    if (!identifier || !password) {
      return validationError(res, "Username and password are required.");
    }

    const query = identifier.includes("@")
      ? { email: identifier }
      : { username: identifier };

    const user = await User.findOne(query).select("+passwordHash");
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid username or password.",
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid username or password.",
      });
    }

    const token = signAccessToken(user);
    return res.json({
      token,
      user: publicUser(user),
    });
  } catch (err) {
    return next(err);
  }
}

/** Stateless JWT logout — client discards token; endpoint for symmetry / future blocklist. */
export async function logout(_req, res) {
  return res.json({ ok: true });
}

export async function me(req, res) {
  return res.json({ user: req.user });
}
