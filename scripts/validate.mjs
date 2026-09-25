// Validación completa antes de commitear o abrir un PR: typecheck + tests + build +
// chequeo de archivos sensibles trackeados. En Node para que corra igual en Windows y CI.
import { execSync } from "node:child_process";

function run(label, command) {
  console.log(`\n▶ ${label}`);
  execSync(command, { stdio: "inherit" });
}

run("Typecheck", "npm run typecheck");
run("Tests", "npm test");
run("Build", "npm run build");

console.log("\n▶ Chequeo de archivos sensibles trackeados");
const SENSITIVE = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example$)/,
  /\.(db|sqlite)$/,
  /\.db-(wal|shm|journal)$/,
  /^data\//,
  /\/prisma\/generated\//
];
const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
const offending = tracked.filter((file) => SENSITIVE.some((pattern) => pattern.test(file)));
if (offending.length > 0) {
  console.error(`✗ Hay archivos sensibles trackeados por git:\n${offending.map((file) => `  - ${file}`).join("\n")}`);
  process.exit(1);
}
console.log("\n✓ Todo OK");
