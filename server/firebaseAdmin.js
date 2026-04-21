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
const hasCredentialFile = fs.existsSync(credPath);
let inlineServiceAccount = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    inlineServiceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    console.warn("[firebaseAdmin] Invalid FIREBASE_SERVICE_ACCOUNT_JSON; ignoring inline credential.");
  }
}

const fireBaseConfigRaw = String(process.env.FIREBASE_CONFIG || "").trim();
let firebaseConfigProjectId = "";
if (fireBaseConfigRaw) {
  try {
    const parsedConfig = JSON.parse(fireBaseConfigRaw);
    firebaseConfigProjectId = String(parsedConfig?.projectId || parsedConfig?.project_id || "").trim();
  } catch {
    firebaseConfigProjectId = "";
  }
}

const inlineProjectId = String(inlineServiceAccount?.project_id || inlineServiceAccount?.projectId || "").trim();
const envProjectId = String(
  process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || firebaseConfigProjectId || ""
).trim();
const hasEmulator = Boolean(String(process.env.FIRESTORE_EMULATOR_HOST || "").trim());
const logLocalFallback = String(process.env.LOG_LOCAL_FALLBACK || "").trim().toLowerCase() === "true";

export const isFirestoreConfigured = Boolean(hasEmulator || inlineProjectId || envProjectId || inlineServiceAccount || hasCredentialFile);

if (!admin.apps.length) {
  if (inlineServiceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(inlineServiceAccount),
    });
  } else if (hasCredentialFile) {
    admin.initializeApp({
      credential: admin.credential.cert(credPath),
    });
  } else {
    // Fall back to application default credentials in local/dev environments.
    admin.initializeApp();
    if (logLocalFallback) {
      console.log("[firebaseAdmin] Credential file not found. Running in local fallback mode unless ADC/projectId is configured.");
    }
  }
}

export const firestore = admin.firestore();
export const auth = admin.auth();
