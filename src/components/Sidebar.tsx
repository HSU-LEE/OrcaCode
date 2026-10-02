import { useMemo, useState, type ReactNode } from "react";

import { api, explain } from "../lib/api";
import { selectWorkspace } from "../lib/workspace";
import { isRunning, useSession } from "../stores/session";
import { useUi } from "../stores/ui";
import { IconPlus, IconSearch, IconSidebar } from "./icons";
import { Logo } from "./Logo";

export function Sidebar() {
  const view = useSession((state) => state.view);
  const conversations = useSession((state) => state.conversations);
  const workspaces = useSession((state) => state.workspaces);
  const conversationId = useSession((state) => state.conversationId);
  const workspacePath = useSession((state) => state.workspacePath);
  const agentState = useSession((state) => state.agentState);
  const setView = useSession((state) => state.setView);
  const newTask = useSession((state) => state.newTask);
  const openConversation = useSession((state) => state.openConversation);
  const setConversations = useSession((state) => state.setConversations);
  const setBanner = useSession((state) => state.setBanner);
  const pinned = useUi((state) => state.pinned);
  const archived = useUi((state) => state.archived);
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const patch = useUi((state) => state.patch);
  const togglePin = useUi((state) => state.togglePin);
  const toggleArchive = useUi((state) => state.toggleArchive);
  const setPalette = useUi((state) => state.setPalette);
  const [query, setQuery] = useState("");
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const running = isRunning(agentState);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (archived.includes(conversation.id)) return false;
      if (!needle) return true;
      return conversation.title.toLowerCase().includes(needle) || (conversation.workspacePath ?? "").toLowerCase().includes(needle);
    });
  }, [archived, conversations, query]);

  const pinnedItems = visible.filter((conversation) => pinned.includes(conversation.id));
  const recent = visible.filter((conversation) => !pinned.includes(conversation.id)).slice(0, 30);

  async function loadConversation(id: string) {
    if (running) return;
    try {
      const detail = await api.getConversation(id);
      if (!detail) return;
      openConversation(detail);
      setView("chat");
    } catch (error) {
      setBanner(explain(error));
    }
  }

  async function remove(id: string) {
    if (running) return;
    try {
      await api.removeConversation(id);
      setConversations(await api.listConversations());
      if (conversationId === id) newTask();
    } catch (error) {
      setBanner(explain(error));
    }
  }

  async function rename(id: string) {
    const next = title.trim();
    setEditing(null);
    if (!next) return;
    try {
      await api.renameConversation(id, next);
      setConversations(await api.listConversations());
    } catch (error) {
      setBanner(explain(error));
    }
  }

  if (!sidebarOpen) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-line bg-panel py-3">
        <button className="rounded-md p-1 hover:bg-elev" title="사이드바" onClick={() => patch({ sidebarOpen: true })}>
          <Logo className="h-6 w-6" />
        </button>
        <button
          className="rounded-md p-2 text-muted hover:bg-elev hover:text-text"
          title="새 채팅"
          onClick={() => {
            newTask();
            setView("chat");
          }}
        >
          <IconPlus />
        </button>
        <button className="rounded-md p-2 text-muted hover:bg-elev hover:text-text" title="검색" onClick={() => setPalette(true)}>
          <IconSearch />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Logo className="h-6 w-6" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">Orca Code</div>
        </div>
        <button className="rounded-md p-1.5 text-muted hover:bg-elev hover:text-text" title="사이드바 숨기기" onClick={() => patch({ sidebarOpen: false })}>
          <IconSidebar />
        </button>
      </div>
      <div className="px-3">
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-text hover:bg-elev"
          onClick={() => {
            newTask();
            setView("chat");
          }}
          disabled={running}
        >
          <IconPlus />
          새 채팅
        </button>
        <label className="mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-muted hover:bg-elev">
          <IconSearch />
          <input
            className="w-full bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
            placeholder="채팅 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="scroll-thin mt-3 min-h-0 flex-1 overflow-auto px-2">
        {pinnedItems.length > 0 ? (
          <Section title="고정">
            {pinnedItems.map((conversation) => (
              <ThreadRow
                key={conversation.id}
                title={conversation.title}
                active={conversation.id === conversationId}
                editing={editing === conversation.id}
                draft={title}
                onDraft={setTitle}
                onOpen={() => void loadConversation(conversation.id)}
                onRename={() => {
                  setEditing(conversation.id);
                  setTitle(conversation.title);
                }}
                onCommit={() => void rename(conversation.id)}
                onPin={() => togglePin(conversation.id)}
                onArchive={() => toggleArchive(conversation.id)}
                onDelete={() => void remove(conversation.id)}
                pinned
              />
            ))}
          </Section>
        ) : null}
        <Section title="프로젝트">
          <button className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-elev hover:text-text" onClick={() => void selectWorkspace()}>
            폴더 추가
          </button>
          {workspaces.map((workspace) => {
            const expanded = openProjects[workspace.path] ?? workspace.path === workspacePath;
            const threads = visible.filter((conversation) => conversation.workspacePath === workspace.path && !pinned.includes(conversation.id));
            return (
              <div key={workspace.id}>
                <button
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                    workspace.path === workspacePath ? "bg-elev text-text" : "text-muted hover:bg-elev hover:text-text"
                  }`}
                  title={workspace.path}
                  onClick={() => {
                    setOpenProjects((state) => ({ ...state, [workspace.path]: !expanded }));
                    void selectWorkspace(workspace.path);
                  }}
                >
                  <span className="text-[10px]">{expanded ? "▾" : "▸"}</span>
                  <span className="truncate">{workspace.name}</span>
                </button>
                {expanded
                  ? threads.map((conversation) => (
                      <div key={conversation.id} className="pl-4">
                        <ThreadRow
                          title={conversation.title}
                          active={conversation.id === conversationId}
                          editing={editing === conversation.id}
                          draft={title}
                          onDraft={setTitle}
                          onOpen={() => void loadConversation(conversation.id)}
                          onRename={() => {
                            setEditing(conversation.id);
                            setTitle(conversation.title);
                          }}
                          onCommit={() => void rename(conversation.id)}
                          onPin={() => togglePin(conversation.id)}
                          onArchive={() => toggleArchive(conversation.id)}
                          onDelete={() => void remove(conversation.id)}
                        />
                      </div>
                    ))
                  : null}
              </div>
            );
          })}
        </Section>
        <Section title="최근">
          {recent.length === 0 ? <div className="px-2 py-1 text-xs text-muted">채팅이 없습니다.</div> : null}
          {recent.map((conversation) => (
            <ThreadRow
              key={conversation.id}
              title={conversation.title}
              active={conversation.id === conversationId}
              editing={editing === conversation.id}
              draft={title}
              onDraft={setTitle}
              onOpen={() => void loadConversation(conversation.id)}
              onRename={() => {
                setEditing(conversation.id);
                setTitle(conversation.title);
              }}
              onCommit={() => void rename(conversation.id)}
              onPin={() => togglePin(conversation.id)}
              onArchive={() => toggleArchive(conversation.id)}
              onDelete={() => void remove(conversation.id)}
            />
          ))}
        </Section>
      </div>
      <div className="border-t border-line p-2">
        <NavButton active={view === "automations"} onClick={() => setView(view === "automations" ? "chat" : "automations")}>
          자동화
        </NavButton>
        <NavButton active={view === "skills"} onClick={() => setView(view === "skills" ? "chat" : "skills")}>
          스킬
        </NavButton>
        <NavButton active={view === "plugins"} onClick={() => setView(view === "plugins" ? "chat" : "plugins")}>
          플러그인
        </NavButton>
        <NavButton active={view === "settings"} onClick={() => setView(view === "settings" ? "chat" : "settings")}>
          설정
        </NavButton>
        <NavButton active={view === "archive"} onClick={() => setView(view === "archive" ? "chat" : "archive")}>
          보관함
        </NavButton>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-3">
      <div className="px-2 py-1 text-[11px] tracking-wide text-muted">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`block w-full rounded-md px-2 py-1.5 text-left text-[13px] ${active ? "bg-elev text-text" : "text-muted hover:bg-elev hover:text-text"}`} onClick={onClick}>
      {children}
    </button>
  );
}

function ThreadRow({
  title,
  active,
  editing,
  draft,
  pinned,
  onDraft,
  onOpen,
  onRename,
  onCommit,
  onPin,
  onArchive,
  onDelete,
}: {
  title: string;
  active: boolean;
  editing: boolean;
  draft: string;
  pinned?: boolean;
  onDraft: (value: string) => void;
  onOpen: () => void;
  onRename: () => void;
  onCommit: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  if (editing) {
    return (
      <input
        autoFocus
        className="w-full rounded-md bg-ink px-2 py-1 text-sm outline-none"
        value={draft}
        onChange={(event) => onDraft(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit();
          if (event.key === "Escape") onCommit();
        }}
      />
    );
  }
  return (
    <div className={`group relative flex items-center rounded-md ${active ? "bg-elev" : "hover:bg-elev"}`}>
      <button className="min-w-0 flex-1 truncate px-2 py-1.5 pr-2 text-left text-[13px] group-hover:pr-24" onClick={onOpen} onDoubleClick={onRename}>
        {title}
      </button>
      <div className="absolute right-1 hidden items-center group-hover:flex">
        <Mini onClick={onPin}>{pinned ? "해제" : "고정"}</Mini>
        <Mini onClick={onArchive}>보관</Mini>
        <Mini onClick={onDelete}>삭제</Mini>
      </div>
    </div>
  );
}

function Mini({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button className="px-1 text-[10px] text-muted hover:text-text" onClick={onClick}>
      {children}
    </button>
  );
}
