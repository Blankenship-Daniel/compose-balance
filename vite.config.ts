/// <reference types="vitest/config" />
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // e2e/ holds the Playwright suite (npm run e2e), not Vitest tests.
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
});
