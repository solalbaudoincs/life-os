import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute top-1.5 right-1.5 px-2 py-0.5 text-[11px] text-muted-foreground/70 bg-muted border border-border rounded opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const components: Components = {
  pre({ children, ...props }) {
    // Extract text content from the code child
    const codeChild = Array.isArray(children)
      ? children.find(
          (c) => typeof c === "object" && c !== null && "type" in c && (c as any).type === "code"
        )
      : typeof children === "object" && children !== null && "type" in children && (children as any).type === "code"
        ? children
        : null;

    const codeText =
      codeChild && typeof codeChild === "object" && "props" in codeChild
        ? String((codeChild as any).props.children ?? "")
        : "";

    return (
      <pre {...props} style={{ position: "relative" }}>
        {codeText && <CopyButton text={codeText} />}
        {children}
      </pre>
    );
  },
};

interface ChatMarkdownProps {
  content: string;
  compact?: boolean;
}

export function ChatMarkdown({ content, compact }: ChatMarkdownProps) {
  return (
    <div className={cn("chatmd", compact && "chatmd-compact")}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const chatMarkdownStyles = `
  .chatmd p { margin: 0 0 10px; }
  .chatmd p:last-child { margin: 0; }
  .chatmd strong { font-weight: 500; color: hsl(var(--foreground)); }
  .chatmd em { font-style: italic; color: hsl(var(--muted-foreground)); }
  .chatmd a { color: hsl(var(--primary)); text-decoration: none; }
  .chatmd a:hover { text-decoration: underline; }

  /* Headings */
  .chatmd h1, .chatmd h2, .chatmd h3, .chatmd h4 {
    font-weight: 500;
    color: hsl(var(--foreground));
    margin: 16px 0 6px;
  }
  .chatmd h1:first-child, .chatmd h2:first-child,
  .chatmd h3:first-child, .chatmd h4:first-child { margin-top: 0; }
  .chatmd h1 { font-size: 1.25em; }
  .chatmd h2 { font-size: 1.15em; }
  .chatmd h3 { font-size: 1.05em; }
  .chatmd h4 { font-size: 1em; }

  /* Lists */
  .chatmd ul, .chatmd ol { padding-left: 1.5em; margin: 6px 0 10px; }
  .chatmd li { margin: 3px 0; }
  .chatmd li > p { margin: 0; }

  /* Inline code */
  .chatmd code {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: hsl(var(--secondary));
    padding: 2px 7px;
    border-radius: 5px;
    color: hsl(var(--primary));
  }

  /* Code blocks */
  .chatmd pre {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 10px;
    padding: 14px 16px;
    overflow: auto;
    margin: 10px 0;
    position: relative;
  }
  .chatmd pre code {
    background: transparent;
    padding: 0;
    color: hsl(var(--foreground));
    font-size: 0.87em;
    border-radius: 0;
  }

  /* Tables (GFM) */
  .chatmd table {
    border-collapse: collapse;
    width: 100%;
    margin: 8px 0;
    font-size: 0.92em;
  }
  .chatmd th, .chatmd td {
    border: 1px solid hsl(var(--border));
    padding: 8px 12px;
    text-align: left;
  }
  .chatmd th {
    background: hsl(var(--muted));
    font-weight: 500;
  }

  /* Blockquote */
  .chatmd blockquote {
    border-left: 2px solid hsl(var(--primary));
    padding-left: 12px;
    color: hsl(var(--muted-foreground));
    margin: 8px 0;
  }
  .chatmd blockquote p { margin: 0; }

  /* Horizontal rule */
  .chatmd hr {
    border: none;
    border-top: 1px solid hsl(var(--border));
    margin: 12px 0;
  }

  /* Task lists (GFM) */
  .chatmd input[type="checkbox"] {
    margin-right: 6px;
    accent-color: hsl(var(--primary));
  }

  /* Strikethrough (GFM) */
  .chatmd del { color: hsl(25 5% 65%); }

  /* Compact variant for chat overlay */
  .chatmd-compact p { margin: 0 0 4px; }
  .chatmd-compact ul, .chatmd-compact ol { margin: 2px 0 4px; }
  .chatmd-compact h1, .chatmd-compact h2,
  .chatmd-compact h3, .chatmd-compact h4 { margin: 8px 0 4px; }
  .chatmd-compact pre { padding: 8px 10px; margin: 4px 0; }
  .chatmd-compact table { font-size: 0.88em; }
  .chatmd-compact blockquote { margin: 4px 0; }
`;
