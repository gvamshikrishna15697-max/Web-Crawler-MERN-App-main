import { verifyAccessToken } from "../utils/jwt.js";
import User from "../models/User.js";

/**
 * Require `Authorization: Bearer <jwt>`. Attaches `req.user` (id, username, email).
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid Authorization header. Use Bearer <token>.",
      });
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired token.",
      });
    }

    const user = await User.findById(payload.sub)
      .select("_id username email")
      .lean();
    if (!user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "User no longer exists.",
      });
    }

    req.user = {
      id: String(user._id),
      username: user.username,
      email: user.email,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}
