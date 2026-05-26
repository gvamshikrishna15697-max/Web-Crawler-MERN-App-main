import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { signAccessToken } from "../utils/jwt.js";
import {
  createAppUser,
  publicUser,
  recordLoginAttempt,
} from "../utils/userAuth.js";

function validationError(res, message) {
  return res.status(400).json({ error: "ValidationError", message });
}

/** Admin-only: create a user account (password stored hashed in MongoDB). */
export async function createUserAdmin(req, res, next) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const user = await createAppUser({
      username: body.username,
      password: body.password,
      email: body.email,
    });
    return res.status(201).json({
      user: publicUser(user),
      message: "User created. They can sign in with their username and password.",
    });
  } catch (err) {
    if (err.status === 400) {
      return validationError(res, err.message);
    }
    if (err.status === 409) {
      return res.status(409).json({ error: "Conflict", message: err.message });
    }
    return next(err);
  }
}

export async function login(req, res, next) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const identifier = String(
      body.identifier || body.email || body.username || "",
    )
      .trim()
      .toLowerCase();
    const password = String(body.password || "");

    if (!identifier || !password) {
      recordLoginAttempt({
        username: identifier || "unknown",
        success: false,
        req,
        failureReason: "missing_credentials",
      });
      return validationError(res, "Username and password are required.");
    }

    const query = identifier.includes("@")
      ? { email: identifier }
      : { username: identifier };

    const user = await User.findOne(query).select("+passwordHash");
    if (!user) {
      recordLoginAttempt({
        username: identifier,
        success: false,
        req,
        failureReason: "user_not_found",
      });
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid username or password.",
      });
    }

    if (user.isActive === false) {
      recordLoginAttempt({
        userId: user._id,
        username: user.username,
        success: false,
        req,
        failureReason: "account_disabled",
      });
      return res.status(403).json({
        error: "Forbidden",
        message: "This account has been disabled. Contact your administrator.",
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      recordLoginAttempt({
        userId: user._id,
        username: user.username,
        success: false,
        req,
        failureReason: "invalid_password",
      });
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid username or password.",
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    recordLoginAttempt({
      userId: user._id,
      username: user.username,
      success: true,
      req,
    });

    const token = signAccessToken(user);
    return res.json({
      token,
      user: publicUser(user),
    });
  } catch (err) {
    return next(err);
  }
}

/** Stateless JWT logout — client discards token. */
export async function logout(_req, res) {
  return res.json({ ok: true });
}

export async function me(req, res) {
  return res.json({ user: req.user });
}
