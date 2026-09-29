import { readFile } from "node:fs/promises";

/**
 * Reads the aggregated stylesheet source: the entry plus every split file
 * under `src/styles/`, in declaration order. Source-level test gates assert
 * against the concatenation so moving a rule between split files does not
 * break the gate for the wrong reason.
 */
export async function readStyleSheetSources(): Promise<string[]> {
  const sources = [
    "../src/styles.css",
    "../src/styles/tokens.css",
    "../src/styles/base.css",
    "../src/styles/components.css",
    "../src/styles/workspace.css",
    "../src/styles/precision.css",
  ];
  return Promise.all(sources.map((source) => readFile(new URL(source, import.meta.url), "utf8")));
}
