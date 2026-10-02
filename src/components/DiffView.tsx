export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="scroll-thin mt-3 max-h-80 overflow-auto rounded-md bg-ink p-2 font-mono text-[11px] leading-5">
      {lines.map((line, index) => {
        const className = line.startsWith("+") && !line.startsWith("+++") ? "diff-add" : line.startsWith("-") && !line.startsWith("---") ? "diff-del" : "text-muted";
        return (
          <div key={`${index}-${line.slice(0, 12)}`} className={className}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}
