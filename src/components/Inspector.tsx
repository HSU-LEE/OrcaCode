import { useEffect, useState } from "react";

import { api, explain } from "../lib/api";
import { useSession } from "../stores/session";
import { useUi } from "../stores/ui";
import { DiffView } from "./DiffView";

const tabs = [
  ["plan", "계획"],
  ["files", "검토"],
  ["sources", "출처"],
  ["terminal", "터미널"],
] as const;

export function Inspector() {
  const tab = useSession((state) => state.inspectorTab);
  const setInspector = useSession((state) => state.setInspector);
  const plan = useSession((state) => state.plan);
  const messages = useSession((state) => state.messages);
  const fileChanges = useSession((state) => state.fileChanges);
  const selectedDiff = useSession((state) => state.selectedDiff);
  const selectDiff = useSession((state) => state.selectDiff);
  const processes = useSession((state) => state.processes);
  const setProcesses = useSession((state) => state.setProcesses);
  const taskId = useSession((state) => state.taskId);
  const agentState = useSession((state) => state.agentState);
  const workspacePath = useSession((state) => state.workspacePath);
  const setBanner = useSession((state) => state.setBanner);
  const setNotice = useUi((state) => state.setNotice);
  const [gitDiff, setGitDiff] = useState("");
  const selected = fileChanges.find((change) => change.path === selectedDiff) ?? fileChanges.at(-1);
  const sources = messages.filter((entry) => entry.kind === "tool" && ["read_file", "search_text", "search_files", "list_directory"].includes(entry.name));

  useEffect(() => {
    if (tab !== "terminal") return;
    void api.listProcesses().then(setProcesses).catch((error) => setBanner(explain(error)));
  }, [setBanner, setProcesses, tab, messages.length]);

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex border-b border-line">
        {tabs.map(([id, label]) => (
          <button key={id} className={`flex-1 border-b px-2 py-2.5 text-xs ${tab === id ? "border-text text-text" : "border-transparent text-muted"}`} onClick={() => setInspector(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3 text-sm">
        {tab === "plan" ? <Plan steps={plan} /> : null}
        {tab === "files" ? (
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs text-muted">{fileChanges.length}개 변경</span>
              <div className="flex gap-1">
                <button
                  className="rounded-md border border-line px-2 py-1 text-xs"
                  onClick={() => {
                    if (!workspacePath) return;
                    void api.workspaceDiff(workspacePath).then(setGitDiff).catch((error) => setBanner(explain(error)));
                  }}
                >
                  Git diff
                </button>
                <button
                  className="rounded-md border border-line px-2 py-1 text-xs disabled:opacity-40"
                  disabled={!taskId || agentState === "thinking" || agentState === "executing_tool"}
                  onClick={() => {
                    if (!taskId) return;
                    void api
                      .undoTask(taskId)
                      .then(() => setNotice("에이전트가 만든 변경을 되돌렸습니다."))
                      .catch((error) => setBanner(explain(error)));
                  }}
                >
                  되돌리기
                </button>
              </div>
            </div>
            {fileChanges.map((change) => (
              <button
                key={change.path}
                className={`mb-1 block w-full truncate rounded px-2 py-1 text-left text-xs ${selected?.path === change.path ? "bg-elev text-text" : "text-muted"}`}
                onClick={() => selectDiff(change.path)}
              >
                {kindMark(change.kind)} {change.path}
              </button>
            ))}
            {selected ? <DiffView diff={selected.diff} /> : <p className="text-xs text-muted">아직 검토할 변경이 없습니다.</p>}
            {gitDiff ? <DiffView diff={gitDiff} /> : null}
          </div>
        ) : null}
        {tab === "sources" ? (
          <div className="space-y-2">
            {sources.length === 0 ? <p className="text-xs text-muted">읽은 파일과 검색이 여기 모입니다.</p> : null}
            {sources.map((entry) =>
              entry.kind === "tool" ? (
                <div key={entry.id} className="rounded-md px-1 py-1">
                  <div className="text-xs text-muted">{entry.name}</div>
                  <div className="truncate text-sm">{preview(entry.arguments)}</div>
                </div>
              ) : null,
            )}
          </div>
        ) : null}
        {tab === "terminal" ? (
          <div className="space-y-2">
            {processes.length === 0 ? <p className="text-xs text-muted">실행 중인 터미널이 없습니다.</p> : null}
            {processes.map((process) => (
              <div key={process.id} className="rounded-xl border border-line p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{process.id}</span>
                  <span className={process.running ? "text-ok" : "text-muted"}>{process.running ? "실행 중" : "종료"}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted">{process.command}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded border border-line px-2 py-1 text-xs"
                    onClick={() =>
                      void api
                        .readProcess(process.id)
                        .then((output) => setNotice(output.slice(-500) || "출력이 없습니다."))
                        .catch((error) => setBanner(explain(error)))
                    }
                  >
                    출력
                  </button>
                  <button className="rounded border border-line px-2 py-1 text-xs" onClick={() => void api.stopProcess(process.id).then(() => api.listProcesses().then(setProcesses))}>
                    중지
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function Plan({ steps }: { steps: { id: string; title: string; status: string }[] }) {
  if (steps.length === 0) return <p className="text-xs text-muted">Plan mode이거나 작업이 길면 단계가 여기에 표시됩니다.</p>;
  return (
    <ol className="space-y-2">
      {steps.map((step, index) => (
        <li key={step.id} className="flex gap-2">
          <span className="w-4 text-xs text-muted">{index + 1}</span>
          <div>
            <div>{step.title}</div>
            <div className="text-[11px] text-muted">{step.status}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function kindMark(kind: string): string {
  if (kind === "added") return "A";
  if (kind === "deleted") return "D";
  return "M";
}

function preview(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const interesting = record.path ?? record.query ?? record.command;
  return typeof interesting === "string" ? interesting : "";
}
