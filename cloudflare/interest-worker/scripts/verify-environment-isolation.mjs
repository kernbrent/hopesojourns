import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(projectDirectory, "wrangler.jsonc"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(`Environment isolation check failed: ${message}`);
}

function routePatterns(environment) {
  return [...(environment.routes || [])].map(route => route.pattern).sort();
}

function database(environment) {
  assert(environment.d1_databases?.length === 1, "each environment must have exactly one D1 database");
  const [binding] = environment.d1_databases;
  assert(binding.binding === "DB", "each environment must use the DB binding");
  return binding;
}

function bucket(environment, bindingName) {
  assert(environment.r2_buckets?.length === 2, "each environment must have separate receipt and guide R2 buckets");
  const binding = environment.r2_buckets.find(candidate => candidate.binding === bindingName);
  assert(binding, `each environment must use the ${bindingName} binding`);
  return binding;
}

assert(!config.routes && !config.vars && !config.d1_databases && !config.r2_buckets && !config.secrets, "top-level routes, variables, secrets, D1 bindings, and R2 bindings must remain unset");
assert(config.env?.test && config.env?.production, "test and production environments are required");

const testEnvironment = config.env.test;
const productionEnvironment = config.env.production;
const testDatabase = database(testEnvironment);
const productionDatabase = database(productionEnvironment);

const testReceiptBucket = bucket(testEnvironment, "RECEIPTS");
const productionReceiptBucket = bucket(productionEnvironment, "RECEIPTS");
const testGuideBucket = bucket(testEnvironment, "GUIDES");
const productionGuideBucket = bucket(productionEnvironment, "GUIDES");
assert(testEnvironment.vars?.ENVIRONMENT === "test", "test ENVIRONMENT must be test");
assert(productionEnvironment.vars?.ENVIRONMENT === "production", "production ENVIRONMENT must be production");
// CSM distribution remains fail-closed in application code when its shared
// secret is absent. It becomes required in test only when the paired
// ChristianSteps test integration is intentionally enabled.
assert(JSON.stringify(testEnvironment.secrets?.required?.sort()) === JSON.stringify(["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"].sort()), "test admin secret declarations are incomplete");
assert(JSON.stringify(productionEnvironment.secrets?.required?.sort()) === JSON.stringify(["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "CSM_DISTRIBUTION_SECRET"].sort()), "production secret declarations are incomplete");
assert(testDatabase.database_name === "hope-sojourns-forms-test-copy-20260923", "the test database name changed unexpectedly");
assert(productionDatabase.database_name === "hope-sojourns-forms-production", "the production database name changed unexpectedly");
assert(testDatabase.database_id !== productionDatabase.database_id, "test and production database IDs must differ");
assert(testReceiptBucket.bucket_name === "hope-sojourns-receipts-test-copy-20260923", "the test receipt bucket name changed unexpectedly");
assert(productionReceiptBucket.bucket_name === "hope-sojourns-receipts-production", "the production receipt bucket name changed unexpectedly");
assert(testReceiptBucket.bucket_name !== productionReceiptBucket.bucket_name, "test and production receipt buckets must differ");
assert(testGuideBucket.bucket_name === "hope-sojourns-guides-test", "the test guide bucket name changed unexpectedly");
assert(productionGuideBucket.bucket_name === "hope-sojourns-guides-production", "the production guide bucket name changed unexpectedly");
assert(testGuideBucket.bucket_name !== productionGuideBucket.bucket_name, "test and production guide buckets must differ");
assert(testGuideBucket.bucket_name !== testReceiptBucket.bucket_name && productionGuideBucket.bucket_name !== productionReceiptBucket.bucket_name, "guide and receipt buckets must differ");

assert(
  JSON.stringify(routePatterns(testEnvironment)) === JSON.stringify([
    "test.hopesojourns.com/api/interest",
    "test.hopesojourns.com/api/interest/*",
  ]),
  "test routes must target only test.hopesojourns.com",
);
assert(
  JSON.stringify(routePatterns(productionEnvironment)) === JSON.stringify([
    "hopesojourns.com/api/interest",
    "hopesojourns.com/api/interest/*",
    "www.hopesojourns.com/api/interest",
    "www.hopesojourns.com/api/interest/*",
  ]),
  "production routes must target only the apex and www production hosts",
);

const testOrigins = String(testEnvironment.vars.ALLOWED_ORIGINS || "");
const productionOrigins = String(productionEnvironment.vars.ALLOWED_ORIGINS || "");
const testOriginList = testOrigins.split(",").map(origin => origin.trim()).filter(Boolean);
const productionOriginList = productionOrigins.split(",").map(origin => origin.trim()).filter(Boolean);
assert(testOriginList.includes("https://test.hopesojourns.com"), "test origins must include the test site");
assert(!testOriginList.includes("https://hopesojourns.com"), "test origins must not include the production apex");
assert(!testOriginList.includes("https://www.hopesojourns.com"), "test origins must not include the production www host");
assert(!productionOrigins.includes("test"), "production origins must not include test hosts");
assert(productionOriginList.includes("https://hopesojourns.com"), "production origins must include the apex site");
assert(productionOriginList.includes("https://www.hopesojourns.com"), "production origins must include the www site");

console.log("Verified isolated test and production Workers, routes, origins, D1 databases, and private R2 receipt and guide buckets.");

assert(!testEnvironment.services?.length, "test must not bind production services");
assert(testEnvironment.vars.SHARED_SIGNIN === "disabled", "test shared sign-in must stay disabled");
assert(testEnvironment.vars.EMAIL_DELIVERY_MODE === "capture" && testEnvironment.vars.MMT_EMAIL_DELIVERY_MODE === "capture", "test mail must stay captured");
assert(testEnvironment.vars.HS_PORTAL_ORIGIN === "https://test.hopesojourns.com", "test account links must stay on test");
