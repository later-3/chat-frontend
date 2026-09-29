import { useEffect, useRef, useState } from "react";
import { highlightCode } from "@/lib/highlight";

interface SourceCodeProps {
  code: string;
  /** Shiki language id or "text"; unknown ids render as plain text. */
  language: string;
  /** Emit `.file-source-line` rows (line numbers + file viewer selection contract). */
  fileSourceLines?: boolean;
  className?: string;
}

/**
 * Renders syntax-highlighted code from Shiki's dual-theme HTML output.
 * Shows escaped plain text until highlighting resolves, so first paint is
 * never blocked on the grammar download. Superseded responses are discarded
 * by request sequence when code or language change.
 */
export function SourceCode({ code, language, fileSourceLines = false, className }: SourceCodeProps) {
  const [html, setHtml] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    let cancelled = false;
    highlightCode(code, language, { fileSourceLines }).then((highlighted) => {
      if (!cancelled && requestRef.current === requestId) setHtml(highlighted);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language, fileSourceLines]);

  if (html === null) {
    return (
      <div className={className}>
        <pre className="shiki"><code>{code}</code></pre>
      </div>
    );
  }

  return (
    <div
      className={className}
      // Shiki HTML escapes code content and only emits spans with inline CSS
      // variables; no untrusted markup reaches this sink.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
