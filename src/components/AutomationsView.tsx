import { useState } from "react";

import type { Automation, Cadence } from "../lib/catalog";
import { useSession } from "../stores/session";
import { useUi } from "../stores/ui";

export function AutomationsView() {
  const automations = useUi((state) => state.automations);
  const saveAutomation = useUi((state) => state.saveAutomation);
  const removeAutomation = useUi((state) => state.removeAutomation);
  const workspacePath = useSession((state) => state.workspacePath);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cadence, setCadence] = useState<Cadence>("daily");

  return (
    <div className="scroll-thin flex-1 overflow-auto px-8 py-6">
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-medium">자동화</h1>
        <p className="mt-2 text-sm text-muted">앱이 켜져 있는 동안 일정에 맞춰 같은 프로젝트를 다시 실행합니다. 먼저 일반 채팅에서 프롬프트를 확인해 두세요.</p>
        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || !prompt.trim() || !workspacePath) return;
            const automation: Automation = {
              id: crypto.randomUUID(),
              name: name.trim(),
              prompt: prompt.trim(),
              workspacePath,
              cadence,
              enabled: true,
              lastRun: 0,
            };
            saveAutomation(automation);
            setName("");
            setPrompt("");
          }}
        >
          <input className="field" placeholder="이름" value={name} onChange={(event) => setName(event.target.value)} />
          <textarea className="field h-24" placeholder="실행할 요청" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <select className="field" value={cadence} onChange={(event) => setCadence(event.target.value as Cadence)}>
            <option value="hourly">매시간</option>
            <option value="daily">매일</option>
            <option value="weekly">매주</option>
          </select>
          <button className="rounded-full bg-white px-4 py-2 text-sm text-black disabled:opacity-40" disabled={!workspacePath}>
            {workspacePath ? "자동화 추가" : "프로젝트를 먼저 선택"}
          </button>
        </form>
        <div className="mt-6 space-y-2">
          {automations.length === 0 ? <p className="text-sm text-muted">아직 자동화가 없습니다.</p> : null}
          {automations.map((automation) => (
            <div key={automation.id} className="rounded-xl border border-line bg-panel-2 px-3 py-3">
              <div className="flex items-center gap-2">
                <div className="font-medium">{automation.name}</div>
                <span className="text-xs text-muted">{label(automation.cadence)}</span>
                <button
                  className="ml-auto text-xs text-muted"
                  onClick={() => saveAutomation({ ...automation, enabled: !automation.enabled })}
                >
                  {automation.enabled ? "일시정지" : "재개"}
                </button>
                <button className="text-xs text-muted" onClick={() => removeAutomation(automation.id)}>
                  삭제
                </button>
              </div>
              <div className="mt-1 truncate text-sm text-muted">{automation.prompt}</div>
              <div className="mt-1 truncate text-xs text-muted">{automation.workspacePath}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function label(cadence: Cadence): string {
  if (cadence === "hourly") return "매시간";
  if (cadence === "weekly") return "매주";
  return "매일";
}
