/**
 * Create a user in MongoDB (admin use only).
 *
 * Usage:
 *   cd server && node scripts/createUser.js --username alice --password 'YourPass123'
 *   cd server && node scripts/createUser.js --username bob --password 'YourPass123' --email bob@example.com
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { createAppUser, publicUser } from "../utils/userAuth.js";

dotenv.config();

function readArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return "";
  return process.argv[i + 1];
}

async function main() {
  const username = readArg("--username");
  const password = readArg("--password");
  const email = readArg("--email");

  if (!username || !password) {
    // eslint-disable-next-line no-console
    console.error(
      "Usage: node scripts/createUser.js --username <name> --password <pass> [--email <email>]",
    );
    process.exit(1);
  }

  const uri = process.env.MONGO_URI;
  if (!uri) {
    // eslint-disable-next-line no-console
    console.error("Missing MONGO_URI in server/.env");
    process.exit(1);
  }

  const tlsInsecure =
    process.env.MONGO_TLS_INSECURE === "true" ||
    process.env.MONGO_TLS_INSECURE === "1";
  await mongoose.connect(uri, {
    tls: true,
    tlsAllowInvalidCertificates: tlsInsecure,
    ...(tlsInsecure ? { tlsAllowInvalidHostnames: true } : {}),
  });
  const user = await createAppUser({ username, password, email });
  // eslint-disable-next-line no-console
  console.log("User created:", publicUser(user));
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.message || err);
  process.exit(1);
});
