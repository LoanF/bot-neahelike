import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Les dépendances restent dans node_modules : seul le code du bot est empaqueté.
  skipNodeModulesBundle: true,
});
