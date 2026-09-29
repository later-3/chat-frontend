/**
 * Shiki-based syntax highlighting shared by chat code blocks and the file
 * viewer. The highlighter is created lazily on first use and grammars load
 * on demand, so the initial bundle only contains this module and shiki core.
 *
 * Output uses Shiki dual themes (vitesse-light / vitesse-dark) with
 * `defaultColor: false`: text colors land in CSS variables that
 * `src/styles/precision.css` switches on `html.dark`, keeping the app tokens
 * authoritative for surfaces.
 */

/** Languages that can be highlighted; anything else renders as plain text. */
export const HIGHLIGHT_LANGUAGES = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "bash",
  "python",
  "css",
  "html",
  "markdown",
  "yaml",
  "sql",
  "go",
  "rust",
  "java",
  "c",
  "cpp",
  "diff",
  "toml",
  "dockerfile",
] as const;

export type HighlightLanguage = (typeof HIGHLIGHT_LANGUAGES)[number] | "text";

/** Extensions that alias to a different grammar id than the extension itself. */
const EXTENSION_ALIASES: Record<string, HighlightLanguage> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  tsx: "tsx",
  json: "json",
  jsonc: "json",
  sh: "bash",
  zsh: "bash",
  bash: "bash",
  py: "python",
  pyw: "python",
  css: "css",
  html: "html",
  htm: "html",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  sql: "sql",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  diff: "diff",
  patch: "diff",
  toml: "toml",
  lock: "toml",
  dockerfile: "dockerfile",
};

/**
 * Map a filename (or bare extension) to a highlight language id.
 * Returns "text" when no grammar matches; the id is always a valid
 * Shiki language or "text".
 */
export function languageFromFilename(filename: string): HighlightLanguage {
  const base = (filename.split("/").pop() ?? filename).toLowerCase();
  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "dockerfile";
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return "text";
  const ext = base.slice(dot + 1).toLowerCase();
  return EXTENSION_ALIASES[ext] ?? "text";
}

type LanguageModule = { default: unknown };

const LANGUAGE_LOADERS: Partial<Record<Exclude<HighlightLanguage, "text">, () => Promise<LanguageModule>>> = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
};

/** Files above this size render as plain text to keep the main thread responsive. */
const MAX_HIGHLIGHT_CHARS = 120_000;

/** Bounded result cache; keys are `lang\0wrap\0code`. */
const RESULT_CACHE_LIMIT = 200;
const resultCache = new Map<string, string>();

interface HighlighterLike {
  loadLanguage: (grammar: unknown) => Promise<void>;
  getLoadedLanguages: () => string[];
  codeToHtml: (code: string, options: Record<string, unknown>) => string;
}

let highlighterPromise: Promise<HighlighterLike> | null = null;
const loadedLanguages = new Set<string>();
let pendingLanguage: Promise<void> | null = null;

async function getHighlighter(): Promise<HighlighterLike> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki/core").then(async ({ createHighlighterCore }) => {
      const [vitesseLight, vitesseDark, engineModule] = await Promise.all([
        import("shiki/themes/vitesse-light.mjs"),
        import("shiki/themes/vitesse-dark.mjs"),
        import("shiki/engine/oniguruma"),
      ]);
      const highlighter = await createHighlighterCore({
        themes: [vitesseLight.default, vitesseDark.default],
        langs: [],
        engine: engineModule.createOnigurumaEngine(import("shiki/wasm")),
      });
      return highlighter as unknown as HighlighterLike;
    });
    highlighterPromise.catch(() => {
      // Allow a later retry after a transient failure.
      highlighterPromise = null;
    });
  }
  return highlighterPromise;
}

async function ensureLanguage(highlighter: HighlighterLike, language: HighlightLanguage): Promise<boolean> {
  if (language === "text" || loadedLanguages.has(language)) return true;
  const loader = LANGUAGE_LOADERS[language];
  if (!loader) return false;
  // Serialise grammar loads so concurrent blocks reuse one in-flight import.
  const previous = pendingLanguage ?? Promise.resolve();
  pendingLanguage = previous
    .catch(() => {})
    .then(async () => {
      const module = await loader();
      await highlighter.loadLanguage(module.default);
      loadedLanguages.add(language);
    });
  await pendingLanguage;
  return loadedLanguages.has(language);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

interface HastElement {
  tagName: string;
  type: string;
  properties: Record<string, unknown>;
  children: unknown[];
}

/**
 * Rewrites Shiki's per-line spans into the structure the file viewer's
 * line-selection logic expects: `.file-source-line[data-line-number]`
 * rows containing a `.file-source-line-content` span.
 */
function collectFileSourceLines(root: HastElement): void {
  for (const child of root.children) {
    if (typeof child !== "object" || child === null) continue;
    const element = child as HastElement;
    if (element.tagName === "code" && Array.isArray(element.children)) {
      for (const lineChild of element.children) {
        if (typeof lineChild !== "object" || lineChild === null) continue;
        const line = lineChild as HastElement;
        const classes = line.properties?.["class"];
        const isLine = Array.isArray(classes) ? classes.includes("line") : classes === "line";
        if (!isLine || !Array.isArray(line.children)) continue;
        line.properties["class"] = ["line", "file-source-line"];
        const content: HastElement = {
          type: "element",
          tagName: "span",
          properties: { class: ["file-source-line-content"] },
          children: line.children,
        };
        line.children = [content];
      }
    }
    if (Array.isArray(element.children)) collectFileSourceLines(element);
  }
}

export interface HighlightOptions {
  /** Emit `.file-source-line` rows for the file viewer's selection contract. */
  fileSourceLines?: boolean;
}

/**
 * Highlight `code` and return an HTML string. Falls back to an escaped
 * plain `<pre><code>` when the language is unknown, the code is too large,
 * or the highlighter fails to load.
 */
export async function highlightCode(
  code: string,
  language: string,
  options: HighlightOptions = {},
): Promise<string> {
  const lang = (HIGHLIGHT_LANGUAGES as readonly string[]).includes(language)
    ? (language as HighlightLanguage)
    : "text";
  const cacheKey = `${lang}\u0000${options.fileSourceLines ? "1" : "0"}\u0000${code}`;
  const cached = resultCache.get(cacheKey);
  if (cached !== undefined) {
    resultCache.delete(cacheKey);
    resultCache.set(cacheKey, cached);
    return cached;
  }

  let html: string;
  try {
    if (lang === "text" || code.length > MAX_HIGHLIGHT_CHARS) {
      html = `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
    } else {
      const highlighter = await getHighlighter();
      if (!(await ensureLanguage(highlighter, lang))) {
        html = `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
      } else {
        const transformers = options.fileSourceLines
          ? [{
              name: "file-source-lines",
              pre(node: HastElement) {
                collectFileSourceLines(node);
              },
            } as never]
          : [];
        html = highlighter.codeToHtml(code, {
          lang,
          themes: { light: "vitesse-light", dark: "vitesse-dark" },
          defaultColor: false,
          transformers,
        });
      }
    }
  } catch {
    html = `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }

  if (resultCache.size >= RESULT_CACHE_LIMIT) {
    resultCache.delete(resultCache.keys().next().value as string);
  }
  resultCache.set(cacheKey, html);
  return html;
}
