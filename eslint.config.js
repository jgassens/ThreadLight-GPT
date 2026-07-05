import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";

const threadlightPlugin = {
  rules: {
    "no-explicit-any": {
      meta: {
        type: "problem",
        docs: {
          description: "Disallow explicit any types"
        },
        messages: {
          unexpectedAny: "Unexpected any. Specify a more precise type."
        }
      },
      create(context) {
        return {
          TSAnyKeyword(node) {
            context.report({ node, messageId: "unexpectedAny" });
          }
        };
      }
    }
  }
};

export default [
  {
    ignores: [
      "coverage/**",
      "dev/**",
      "extension/dist/**",
      "extension/manifest.json",
      "native/**",
      "node_modules/**",
      "packages/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      threadlight: threadlightPlugin
    },
    rules: {
      "threadlight/no-explicit-any": "error",
      "no-undef": "off",
      "no-unused-vars": "off"
    }
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly"
      }
    }
  }
];
