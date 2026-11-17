// Runs a script that imports src/ modules (which use extensionless
// imports, resolved by Vite) through Vite's SSR loader.
// Usage: node scripts/viteRun.mjs scripts/genInstaMealsAU.mjs
import { createServer } from "vite";
import path from "path";
const target = process.argv[2];
const server = await createServer({ configFile: false, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
try {
  await server.ssrLoadModule(path.resolve(target));
} finally {
  await server.close();
}
