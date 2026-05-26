import jwt from "jsonwebtoken";

const DEFAULT_EXPIRES = "24h";

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET must be set in server/.env (at least 16 characters)",
    );
  }
  return secret;
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      username: user.username,
      email: user.email,
    },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret());
}
