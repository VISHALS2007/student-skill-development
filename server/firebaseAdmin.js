import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer GOOGLE_APPLICATION_CREDENTIALS, then serviceAccount.json, then ADC.
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, "serviceAccount.json");
let inlineServiceAccount = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    inlineServiceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    console.warn("[firebaseAdmin] Invalid FIREBASE_SERVICE_ACCOUNT_JSON; ignoring inline credential.");
  }
}

if (!admin.apps.length) {
  if (inlineServiceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(inlineServiceAccount),
    });
  } else if (fs.existsSync(credPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(credPath),
    });
  } else {
    // Fall back to application default credentials in local/dev environments.
    admin.initializeApp();
    console.warn("[firebaseAdmin] Credential file not found. Falling back to application default credentials.");
  }
}

export const firestore = admin.firestore();
export const auth = admin.auth();
