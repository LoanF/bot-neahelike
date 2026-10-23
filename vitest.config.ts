import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Avec une base de test, les fichiers se partagent ses tables (le journal `events` notamment) : un à la fois.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
