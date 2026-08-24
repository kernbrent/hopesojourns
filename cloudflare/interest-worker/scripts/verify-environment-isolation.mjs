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

assert(!config.routes && !config.vars && !config.d1_databases && !config.secrets, "top-level routes, variables, secrets, and D1 bindings must remain unset");
assert(config.env?.test && config.env?.production, "test and production environments are required");

const testEnvironment = config.env.test;
const productionEnvironment = config.env.production;
const testDatabase = database(testEnvironment);
const productionDatabase = database(productionEnvironment);

assert(testEnvironment.vars?.ENVIRONMENT === "test", "test ENVIRONMENT must be test");
assert(productionEnvironment.vars?.ENVIRONMENT === "production", "production ENVIRONMENT must be production");
assert(JSON.stringify(testEnvironment.secrets?.required?.sort()) === JSON.stringify(["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "CSM_DISTRIBUTION_SECRET"].sort()), "test secret declarations are incomplete");
assert(JSON.stringify(productionEnvironment.secrets?.required?.sort()) === JSON.stringify(["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "CSM_DISTRIBUTION_SECRET"].sort()), "production secret declarations are incomplete");
assert(testDatabase.database_name === "hope-sojourns-forms-test", "the test database name changed unexpectedly");
assert(productionDatabase.database_name === "hope-sojourns-forms-production", "the production database name changed unexpectedly");
assert(testDatabase.database_id !== productionDatabase.database_id, "test and production database IDs must differ");

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

console.log("Verified isolated test and production Workers, routes, origins, and D1 databases.");
