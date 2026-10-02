import { useEffect, useMemo, useState } from "react";

import { useSession } from "../stores/session";
import { useUi } from "../stores/ui";
import { selectWorkspace } from "../lib/workspace";

export function CommandPalette() {
  const open = useUi((state) => state.paletteOpen);
  const setPalette = useUi((state) => state.setPalette);
  const patch = useUi((state) => state.patch);
  const setView = useSession((state) => state.setView);
  const newTask = useSession((state) => state.newTask);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const actions = useMemo(
    () => [
      { id: "new", label: "새 채팅", hint: "⌘N", run: () => { newTask(); setView("chat"); } },
      { id: "folder", label: "폴더 열기", hint: "⌘O", run: () => void selectWorkspace() },
      { id: "sidebar", label: "사이드바 전환", hint: "⌘B", run: () => patch({ sidebarOpen: !useUi.getState().sidebarOpen }) },
      { id: "task", label: "작업 패널 전환", hint: "⌘J", run: () => patch({ taskOpen: !useUi.getState().taskOpen }) },
      { id: "find", label: "채팅에서 찾기", hint: "⌘F", run: () => useUi.getState().setFind(true) },
      { id: "plan", label: "Plan mode 전환", run: () => patch({ runMode: useUi.getState().runMode === "plan" ? "agent" : "plan" }) },
      { id: "skills", label: "스킬", run: () => setView("skills") },
      { id: "auto", label: "자동화", run: () => setView("automations") },
      { id: "plugins", label: "플러그인", run: () => setView("plugins") },
      { id: "settings", label: "설정", hint: "⌘,", run: () => setView("settings") },
    ],
    [newTask, patch, setView],
  );

  const visible = actions.filter((action) => action.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  if (!open) return null;

  function choose(position = index) {
    const action = visible[position];
    if (!action) return;
    action.run();
    setPalette(false);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/50 px-4 pt-[18vh]" onMouseDown={() => setPalette(false)}>
      <div className="popover w-full max-w-lg overflow-hidden" onMouseDown={(event) => event.stopPropagation()}>
        <input
          autoFocus
          className="w-full bg-transparent px-4 py-3 text-sm outline-none"
          placeholder="명령 검색"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setPalette(false);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIndex((value) => Math.min(value + 1, Math.max(visible.length - 1, 0)));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setIndex((value) => Math.max(value - 1, 0));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              choose();
            }
          }}
        />
        <div className="max-h-72 overflow-auto border-t border-line py-1">
          {visible.length === 0 ? <div className="px-4 py-3 text-sm text-muted">일치하는 명령이 없습니다.</div> : null}
          {visible.map((action, position) => (
            <button
              key={action.id}
              className={`flex w-full items-center px-4 py-2 text-left text-sm ${position === index ? "bg-elev" : ""}`}
              onMouseEnter={() => setIndex(position)}
              onClick={() => choose(position)}
            >
              <span>{action.label}</span>
              {action.hint ? <span className="ml-auto text-xs text-muted">{action.hint}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
