import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated PWA service worker output, not source we own or lint.
    "public/**",
    "src/generated/**",
  ]),
  {
    rules: {
      // Fetch-on-mount + poll-on-interval is an intentional, standard pattern
      // throughout this app's client pages (map/challenges/leaderboard/admin
      // queues all poll the API every ~10-20s).
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
