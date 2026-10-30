// Run by .github/workflows/ingest.yml when an issue labelled "result" is opened.
// Validates the result block in the issue and appends it to public/data/results.json.
// Node 24 runs the imported TypeScript directly (type stripping).

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { parseIssueBody, validateResult } from "../src/core/result.ts";

const DATA = new URL("../public/data/results.json", import.meta.url);

export function ingest(body, existing) {
  const parsed = parseIssueBody(body ?? "");
  if (!parsed) {
    return { status: "invalid", results: existing,
      message: "Could not find the result block. Please run the test again and submit without editing the block." };
  }
  const errors = validateResult(parsed);
  if (errors.length) {
    return { status: "invalid", results: existing, message: `The result did not pass the checks:\n- ${errors.join("\n- ")}` };
  }
  if (existing.some((r) => r.id === parsed.id)) {
    return { status: "duplicate", results: existing, message: "This result is already in the public table." };
  }
  return { status: "added", results: [...existing, parsed], message: "Added to the public results. Thank you." };
}

export function serialize(results) {
  return `[\n${results.map((r) => JSON.stringify(r)).join(",\n")}\n]`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const existing = JSON.parse(readFileSync(DATA, "utf8"));
  const out = ingest(event.issue?.body, existing);
  if (out.status === "added") writeFileSync(DATA, serialize(out.results) + "\n");
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `status=${out.status}\nmessage<<EOM\n${out.message}\nEOM\n`);
  }
  console.log(out.status, out.message);
}
