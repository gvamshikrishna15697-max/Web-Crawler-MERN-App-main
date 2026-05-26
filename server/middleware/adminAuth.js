/**
 * Protect admin-only routes (e.g. creating users). Set ADMIN_TOKEN in server/.env.
 * Send header: X-Admin-Token: <token>  OR  Authorization: Bearer <token>
 */
export function requireAdminToken(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 8) {
    return res.status(503).json({
      error: "AdminNotConfigured",
      message: "ADMIN_TOKEN is not set on the server.",
    });
  }

  const header = req.headers["x-admin-token"];
  const bearer = req.headers.authorization || "";
  const fromBearer =
    bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  const provided = String(header || fromBearer || "");

  if (!provided || provided !== expected) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Invalid admin token.",
    });
  }

  return next();
}
