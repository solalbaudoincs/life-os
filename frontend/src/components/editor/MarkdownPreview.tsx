import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="md-preview text-base leading-relaxed text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>

      <style>{`
        .md-preview h1, .md-preview h2, .md-preview h3 {
          margin-top: 1.2em;
          margin-bottom: 0.4em;
          font-weight: 500;
        }
        .md-preview h1 { font-size: 1.4em; }
        .md-preview h2 { font-size: 1.2em; }
        .md-preview h3 { font-size: 1.05em; }
        .md-preview p { margin-bottom: 0.6em; }
        .md-preview ul, .md-preview ol { padding-left: 1.5em; margin-bottom: 0.6em; }
        .md-preview li { margin-bottom: 0.2em; }
        .md-preview code {
          font-family: var(--font-mono);
          font-size: 0.9em;
          background: hsl(var(--muted));
          padding: 1px 4px;
          border-radius: 3px;
        }
        .md-preview pre {
          background: hsl(var(--muted));
          padding: 12px;
          border-radius: 6px;
          overflow-x: auto;
          margin-bottom: 0.6em;
        }
        .md-preview pre code {
          background: none;
          padding: 0;
        }
        .md-preview table {
          border-collapse: collapse;
          width: 100%;
          margin-bottom: 0.6em;
        }
        .md-preview th, .md-preview td {
          border: 1px solid hsl(var(--border));
          padding: 6px 10px;
          text-align: left;
        }
        .md-preview th {
          background: hsl(var(--muted));
          font-weight: 500;
        }
        .md-preview a { color: hsl(var(--primary)); }
        .md-preview blockquote {
          border-left: 2px solid hsl(var(--border));
          padding-left: 12px;
          color: hsl(var(--muted-foreground));
          margin-bottom: 0.6em;
        }
        .md-preview hr {
          border: none;
          border-top: 1px solid hsl(var(--border));
          margin: 1.2em 0;
        }
      `}</style>
    </div>
  );
}
