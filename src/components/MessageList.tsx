import { useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "../stores/session";
import { useUi } from "../stores/ui";
import type { ChatEntry, FileChange } from "../types";
import { DiffView } from "./DiffView";
import { MarkdownMessage } from "./MarkdownMessage";

export function MessageList() {
  const messages = useSession((state) => state.messages);
  const agentState = useSession((state) => state.agentState);
  const fileChanges = useSession((state) => state.fileChanges);
  const findQuery = useUi((state) => state.findQuery);
  const findOpen = useUi((state) => state.findOpen);
  const findIndex = useUi((state) => state.findIndex);
  const bottom = useRef<HTMLDivElement>(null);
  const query = findOpen ? findQuery.trim() : "";
  const hits = useMemo(() => matchingIds(messages, query), [messages, query]);

  useEffect(() => {
    if (query) return;
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, agentState, query]);

  useEffect(() => {
    const id = hits[findIndex];
    if (!id) return;
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center" });
  }, [findIndex, hits]);

  return (
    <div className="scroll-thin flex-1 overflow-auto px-6 py-6">
      <div className="mx-auto flex max-w-[720px] flex-col gap-5">
        {messages.map((entry) => (
          <div id={`msg-${entry.id}`} key={entry.id}>
            <Entry entry={entry} query={query} changes={fileChanges} active={hits[findIndex] === entry.id} />
          </div>
        ))}
        {agentState === "thinking" && !messages.some((entry) => entry.kind === "assistant" && entry.streaming) ? (
          <div className="text-xs text-muted">작업 중</div>
        ) : null}
        <div ref={bottom} />
      </div>
    </div>
  );
}

function matchingIds(messages: ChatEntry[], query: string): string[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  return messages.filter((entry) => entryText(entry).toLowerCase().includes(needle)).map((entry) => entry.id);
}

function entryText(entry: ChatEntry): string {
  if (entry.kind === "tool") return `${entry.name} ${entry.output} ${previewArgs(entry.arguments)}`;
  return entry.content;
}

function Entry({
  entry,
  query,
  changes,
  active,
}: {
  entry: ChatEntry;
  query: string;
  changes: FileChange[];
  active: boolean;
}) {
  const ring = active ? "rounded-xl ring-1 ring-[#e3b341]" : "";
  if (entry.kind === "user") {
    return (
      <div className={`ml-auto max-w-[80%] rounded-2xl bg-elev px-4 py-2.5 text-[15px] leading-6 ${ring}`}>
        <Highlight text={entry.content} query={query} />
      </div>
    );
  }
  if (entry.kind === "assistant") {
    return (
      <div className={ring}>
        <MarkdownMessage text={entry.content} query={query} />
        {entry.streaming ? <span className="ml-1 inline-block h-3 w-1.5 bg-white align-middle" /> : null}
      </div>
    );
  }
  if (entry.kind === "note") {
    return <div className="text-xs text-warn">{entry.content}</div>;
  }
  return <ToolRow entry={entry} query={query} changes={changes} />;
}

function ToolRow({ entry, query, changes }: { entry: Extract<ChatEntry, { kind: "tool" }>; query: string; changes: FileChange[] }) {
  const [open, setOpen] = useState(false);
  const path = previewArgs(entry.arguments);
  const diff = changes.find((change) => change.path === path)?.diff;
  const tone = entry.status === "ok" ? "text-ok" : entry.status === "running" ? "text-text" : entry.status === "denied" ? "text-warn" : "text-danger";
  return (
    <div className="text-sm">
      <button className="flex w-full min-w-0 items-center gap-2 py-1 text-left text-muted hover:text-text" onClick={() => setOpen((value) => !value)}>
        <span className="text-[10px]">{open ? "▾" : "▸"}</span>
        <span>{toolLabel(entry.name)}</span>
        <span className="min-w-0 flex-1 truncate">{path}</span>
        <span className={`ml-auto text-xs ${tone}`}>{statusLabel(entry.status)}</span>
      </button>
      {open ? (
        <div className="mb-2 ml-4 rounded-xl border border-line bg-panel-2">
          {diff ? <DiffView diff={diff} /> : null}
          <pre className="scroll-thin max-h-64 overflow-auto px-3 py-2 text-xs leading-5 text-muted">
            <Highlight text={entry.output || "출력이 없습니다."} query={query} />
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const expression = new RegExp(`(${escapeRegExp(query)})`, "ig");
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    terminal_execute: "명령 실행",
    read_file: "파일 읽기",
    edit_file: "파일 수정",
    write_file: "파일 생성",
    list_directory: "폴더 조회",
    search_text: "검색",
    search_files: "파일 검색",
    git_status: "Git 상태",
    git_diff: "Git diff",
    git_commit: "커밋",
    process_start: "프로세스 시작",
    process_stop: "프로세스 중지",
    update_plan: "계획 갱신",
    screenshot: "화면 캡처",
    open_url: "브라우저",
    open_application: "앱 열기",
  };
  return labels[name] ?? name;
}

function statusLabel(status: string): string {
  if (status === "ok") return "완료";
  if (status === "running") return "실행 중";
  if (status === "denied") return "거부";
  return "실패";
}

function previewArgs(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const interesting = record.command ?? record.path ?? record.query ?? record.url ?? record.name ?? record.message;
  return typeof interesting === "string" ? interesting : "";
}

export function FindBar() {
  const findOpen = useUi((state) => state.findOpen);
  const findQuery = useUi((state) => state.findQuery);
  const findIndex = useUi((state) => state.findIndex);
  const setFind = useUi((state) => state.setFind);
  const setFindIndex = useUi((state) => state.setFindIndex);
  const messages = useSession((state) => state.messages);
  const count = useMemo(() => matchingIds(messages, findOpen ? findQuery.trim() : "").length, [findOpen, findQuery, messages]);
  if (!findOpen) return null;
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-2">
      <input
        autoFocus
        className="w-56 rounded-md border border-line bg-panel-2 px-2 py-1 text-sm outline-none"
        placeholder="채팅에서 찾기"
        value={findQuery}
        onChange={(event) => setFind(true, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setFind(false, "");
          if (event.key === "Enter") setFindIndex(count === 0 ? 0 : (findIndex + 1) % count);
        }}
      />
      <span className="text-xs text-muted">{count === 0 ? "0" : `${findIndex + 1} / ${count}`}</span>
      <button className="text-xs text-muted" onClick={() => setFindIndex(count === 0 ? 0 : (findIndex - 1 + count) % count)}>
        이전
      </button>
      <button className="text-xs text-muted" onClick={() => setFindIndex(count === 0 ? 0 : (findIndex + 1) % count)}>
        다음
      </button>
      <button className="ml-auto text-xs text-muted" onClick={() => setFind(false, "")}>
        닫기
      </button>
    </div>
  );
}

