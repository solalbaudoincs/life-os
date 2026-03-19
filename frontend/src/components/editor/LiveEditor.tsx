import { useRef, useEffect } from "react";
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

export function LiveEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<MDXEditorMethods>(null);

  useEffect(() => {
    if (editorRef.current) {
      const current = editorRef.current.getMarkdown();
      if (current !== content) {
        editorRef.current.setMarkdown(content);
      }
    }
  }, [content]);

  return (
    <>
      <MDXEditor
        ref={editorRef}
        markdown={content}
        onChange={onChange}
        contentEditableClassName="mdx-live-editor"
        className="light-mdxeditor"
        placeholder="Start writing..."
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          markdownShortcutPlugin(),
          linkPlugin(),
          tablePlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
          codeMirrorPlugin({
            codeBlockLanguages: {
              js: "JavaScript",
              ts: "TypeScript",
              py: "Python",
              css: "CSS",
              html: "HTML",
              json: "JSON",
              sql: "SQL",
              sh: "Shell",
              "": "Plain text",
            },
          }),
        ]}
      />

      <style>{editorStyles}</style>
    </>
  );
}

const editorStyles = `
  /* Kill all MDXEditor chrome */
  .light-mdxeditor {
    background: transparent !important;
    border: none !important;
    font-family: inherit !important;
    color: hsl(var(--foreground)) !important;
    --accentBase: hsl(var(--primary));
    --accentBgSubtle: hsl(var(--muted));
    --accentBgActive: hsl(var(--secondary));
    --accentText: hsl(var(--primary));
    --accentTextContrast: hsl(var(--background));
    --baseBase: hsl(var(--background));
    --baseBgSubtle: hsl(var(--card));
    --baseBgActive: hsl(var(--secondary));
    --baseBgHover: hsl(var(--muted));
    --baseBorder: hsl(var(--border));
    --baseLine: hsl(var(--border));
    --baseSolid: hsl(25 5% 65%);
    --baseText: hsl(var(--foreground));
    --baseTextHighContrast: hsl(var(--foreground));
    --baseTextLoContrast: hsl(25 5% 65%);
    --basePageBg: transparent;
  }

  /* Content area */
  .mdx-live-editor {
    font-size: 1rem;
    line-height: 1.7;
    color: hsl(var(--foreground));
    font-family: inherit;
    min-height: 300px;
    outline: none;
    padding: 0 !important;
  }
  .mdx-live-editor [data-placeholder]::before {
    color: hsl(25 5% 65%) !important;
    opacity: 0.5;
  }
  .mdx-live-editor p { margin: 0.3em 0; }
  .mdx-live-editor h1 { font-size: 1.5em; font-weight: 600; margin: 0.8em 0 0.3em; color: hsl(var(--foreground)); }
  .mdx-live-editor h2 { font-size: 1.25em; font-weight: 600; margin: 0.7em 0 0.3em; color: hsl(var(--foreground)); }
  .mdx-live-editor h3 { font-size: 1.1em; font-weight: 500; margin: 0.6em 0 0.2em; color: hsl(var(--foreground)); }
  .mdx-live-editor ul, .mdx-live-editor ol { padding-left: 1.5em; margin: 0.3em 0; }
  .mdx-live-editor li { margin-bottom: 0.1em; }
  .mdx-live-editor li::marker { color: hsl(25 5% 65%); }
  .mdx-live-editor blockquote {
    border-left: 2px solid hsl(var(--primary));
    padding-left: 14px;
    color: hsl(var(--muted-foreground));
    margin: 0.4em 0;
  }
  .mdx-live-editor a { color: hsl(var(--primary)); text-decoration: underline; text-underline-offset: 2px; }
  .mdx-live-editor strong { font-weight: 600; }
  .mdx-live-editor em { font-style: italic; }
  .mdx-live-editor code {
    font-family: var(--font-mono);
    font-size: 0.88em;
    background: hsl(var(--muted));
    padding: 2px 5px;
    border-radius: 3px;
    color: hsl(var(--primary));
  }
  .mdx-live-editor pre {
    background: hsl(var(--muted)) !important;
    padding: 14px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0.5em 0;
    border: 1px solid hsl(var(--border));
  }
  .mdx-live-editor pre code { background: none; padding: 0; color: hsl(var(--foreground)); }
  .mdx-live-editor table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
  .mdx-live-editor th, .mdx-live-editor td {
    border: 1px solid hsl(var(--border));
    padding: 8px 12px;
    text-align: left;
  }
  .mdx-live-editor th { background: hsl(var(--muted)); font-weight: 500; color: hsl(var(--muted-foreground)); }
  .mdx-live-editor hr { border: none; border-top: 1px solid hsl(var(--border)); margin: 1.2em 0; }

  /* CodeMirror inside editor */
  .light-mdxeditor .cm-editor {
    background: hsl(var(--muted)) !important;
    border-radius: 6px !important;
    border: 1px solid hsl(var(--border)) !important;
  }
  .light-mdxeditor .cm-editor .cm-content { font-family: var(--font-mono) !important; color: hsl(var(--foreground)) !important; }
  .light-mdxeditor .cm-editor .cm-gutters { background: hsl(var(--muted)) !important; border-right: 1px solid hsl(var(--border)) !important; color: hsl(25 5% 65%) !important; }
  .light-mdxeditor .cm-editor .cm-activeLine { background: hsl(var(--secondary)) !important; }
  .light-mdxeditor .cm-editor .cm-cursor { border-left-color: hsl(var(--foreground)) !important; }
  .light-mdxeditor .cm-editor .cm-selectionBackground { background: hsl(var(--secondary)) !important; }
`;
