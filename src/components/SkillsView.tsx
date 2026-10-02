import { useState } from "react";

import { BUILTIN_SKILLS, type Skill } from "../lib/catalog";
import { useUi } from "../stores/ui";

const empty: Skill = { id: "", name: "", description: "", body: "" };

export function SkillsView() {
  const skills = useUi((state) => state.skills);
  const saveSkill = useUi((state) => state.saveSkill);
  const removeSkill = useUi((state) => state.removeSkill);
  const [draft, setDraft] = useState<Skill>(empty);

  function edit(skill: Skill) {
    setDraft(skill.builtin ? { ...skill, id: crypto.randomUUID(), builtin: false } : skill);
  }

  return (
    <div className="scroll-thin flex-1 overflow-auto px-8 py-6">
      <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-[240px_1fr]">
        <div>
          <h1 className="text-xl font-medium">스킬</h1>
          <p className="mt-2 text-sm text-muted">채팅에 $이름 을 입력하면 그 지시를 이번 실행에 붙입니다.</p>
          <div className="mt-4 space-y-1">
            {BUILTIN_SKILLS.map((skill) => (
              <button key={skill.id} className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-elev" onClick={() => edit(skill)}>
                ${skill.name}
                <div className="text-xs text-muted">{skill.description}</div>
              </button>
            ))}
            {skills.map((skill) => (
              <button key={skill.id} className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-elev" onClick={() => edit(skill)}>
                ${skill.name}
                <div className="text-xs text-muted">{skill.description}</div>
              </button>
            ))}
          </div>
        </div>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const name = draft.name.trim().replace(/\s+/g, "-");
            if (!name || !draft.body.trim()) return;
            saveSkill({ ...draft, id: draft.id || crypto.randomUUID(), name, builtin: false });
            setDraft(empty);
          }}
        >
          <label className="block text-sm">
            <div className="mb-1 text-muted">이름</div>
            <input className="field" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="block text-sm">
            <div className="mb-1 text-muted">설명</div>
            <input className="field" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </label>
          <label className="block text-sm">
            <div className="mb-1 text-muted">지시</div>
            <textarea className="field h-48 font-mono text-xs" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
          </label>
          <div className="flex gap-2">
            <button className="rounded-full bg-white px-4 py-2 text-sm text-black" type="submit">
              저장
            </button>
            {draft.id && skills.some((skill) => skill.id === draft.id) ? (
              <button
                className="rounded-full border border-line px-4 py-2 text-sm"
                type="button"
                onClick={() => {
                  removeSkill(draft.id);
                  setDraft(empty);
                }}
              >
                삭제
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
