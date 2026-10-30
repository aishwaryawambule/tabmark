import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const version = (pkg: string) => JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, "utf8")).version;

// Relative base so the build works on GitHub Pages under /<repo>/.
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  define: {
    __WEBLLM_VERSION__: JSON.stringify(version("@mlc-ai/web-llm")),
    __WLLAMA_VERSION__: JSON.stringify(version("@wllama/wllama")),
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync("package.json", "utf8")).version),
  },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
