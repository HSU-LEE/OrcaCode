import type { ReactNode } from "react";

type Block =
  | { kind: "code"; text: string }
  | { kind: "ol"; items: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string };

export function MarkdownMessage({ text, query }: { text: string; query: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-3 text-[15px] leading-7">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} query={query} />
      ))}
    </div>
  );
}

function BlockView({ block, query }: { block: Block; query: string }) {
  if (block.kind === "code") {
    return <pre className="scroll-thin overflow-auto rounded-xl bg-panel-2 px-3 py-2 font-mono text-[13px] leading-6 text-text">{block.text}</pre>;
  }
  if (block.kind === "ol") {
    return (
      <ol className="list-decimal space-y-1 pl-5">
        {block.items.map((item, index) => (
          <li key={index}>
            <Inline text={item} query={query} />
          </li>
        ))}
      </ol>
    );
  }
  if (block.kind === "ul") {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {block.items.map((item, index) => (
          <li key={index}>
            <Inline text={item} query={query} />
          </li>
        ))}
      </ul>
    );
  }
  if (block.kind === "h") {
    return <div className={block.level === 1 ? "text-lg font-medium" : "font-medium"}><Inline text={block.text} query={query} /></div>;
  }
  return (
    <p>
      <Inline text={block.text} query={query} />
    </p>
  );
}

function Inline({ text, query }: { text: string; query: string }) {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(<Highlight key={nodes.length} text={text.slice(last, start)} query={query} />);
    const token = match[0];
    if (token.startsWith("`")) nodes.push(<code key={nodes.length} className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[0.92em]">{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) nodes.push(<strong key={nodes.length}><Highlight text={token.slice(2, -2)} query={query} /></strong>);
    else nodes.push(<em key={nodes.length}><Highlight text={token.slice(1, -1)} query={query} /></em>);
    last = start + token.length;
  }
  if (last < text.length) nodes.push(<Highlight key={nodes.length} text={text.slice(last)} query={query} />);
  return <>{nodes}</>;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const expression = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  const parts = text.split(expression);
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="find-hit">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const parts = source.split("```");
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const breakAt = part.indexOf("\n");
      const body = breakAt === -1 ? part : part.slice(breakAt + 1);
      blocks.push({ kind: "code", text: body.replace(/\n$/, "") });
      return;
    }
    parseProse(part, blocks);
  });
  return blocks.filter((block) => block.kind === "code" || ("text" in block ? block.text.trim() : block.items.length > 0));
}

function parseProse(source: string, blocks: Block[]) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { kind: "ol" | "ul"; items: string[] } | null = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "p", text: paragraph.join(" ").trim() });
    paragraph = [];
  }
  function flushList() {
    if (!list || list.items.length === 0) {
      list = null;
      return;
    }
    blocks.push(list);
    list = null;
  }

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line.trim());
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line.trim());
    const bullet = /^[-*]\s+(.*)$/.exec(line.trim());
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "h", level: heading[1].length, text: heading[2] });
      continue;
    }
    if (ordered) {
      flushParagraph();
      if (!list || list.kind !== "ol") {
        flushList();
        list = { kind: "ol", items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }
    if (bullet) {
      flushParagraph();
      if (!list || list.kind !== "ul") {
        flushList();
        list = { kind: "ul", items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
}
