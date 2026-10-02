import { useEffect, useState, type ReactNode } from "react";

import { api, explain } from "../lib/api";
import { useSession } from "../stores/session";
import { useUi } from "../stores/ui";
import { useSettings } from "../stores/settings";
import type { Settings } from "../types";
import { ModelLibrary } from "./ModelLibrary";
import { UpdateSection } from "./UpdateSection";

const sections = ["일반", "모델", "권한", "컴퓨터", "단축키"] as const;

export function SettingsView() {
  const settings = useSettings((state) => state.settings);
  const defaultPrompt = useSettings((state) => state.defaultPrompt);
  const setSettings = useSettings((state) => state.setSettings);
  const setBanner = useSession((state) => state.setBanner);
  const setOllama = useSession((state) => state.setOllama);
  const personality = useUi((state) => state.personality);
  const patchUi = useUi((state) => state.patch);
  const [draft, setDraft] = useState(settings);
  const [section, setSection] = useState<(typeof sections)[number]>("일반");
  const [accessibility, setAccessibility] = useState<boolean | null>(null);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    void api.accessibilityStatus().then(setAccessibility).catch(() => setAccessibility(false));
    void api
      .ensureOllamaServer()
      .then(async () => {
        const status = await api.ollamaStatus();
        const models = status.online ? await api.ollamaModels().catch(() => []) : [];
        setOllama(status.online, status.message, models);
      })
      .catch((error) => setBanner(explain(error)));
  }, [setBanner, setOllama]);

  async function save(next: Settings = draft) {
    try {
      const saved = await api.saveSettings(next);
      setSettings(saved);
      const status = await api.ollamaStatus();
      const models = status.online ? await api.ollamaModels().catch(() => []) : [];
      setOllama(status.online, status.message, models);
      setBanner("설정을 저장했습니다.");
    } catch (error) {
      setBanner(explain(error));
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-44 shrink-0 border-r border-line p-3">
        <div className="px-2 py-2 text-sm font-medium">설정</div>
        {sections.map((item) => (
          <button key={item} className={`block w-full rounded-md px-2 py-1.5 text-left text-sm ${section === item ? "bg-elev" : "text-muted"}`} onClick={() => setSection(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="scroll-thin min-w-0 flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-xl">
          {section === "일반" ? (
            <div className="space-y-4">
              <h1 className="text-xl font-medium">일반</h1>
              <p className="text-sm text-muted">대화와 설정은 이 기기에만 저장됩니다. 클라우드 계정은 사용하지 않습니다.</p>
              <p className="text-sm text-muted">Ollama는 앱을 열 때 켜지고, 이 앱이 켠 서버는 창을 닫으면 함께 종료됩니다. 기본 모델은 qwen2.5-coder:7b입니다.</p>
              <UpdateSection />
              <Field label="성격">
                <select className="field" value={personality} onChange={(event) => patchUi({ personality: event.target.value as "pragmatic" | "friendly" })}>
                  <option value="pragmatic">Pragmatic</option>
                  <option value="friendly">Friendly</option>
                </select>
              </Field>
              <p className="text-xs text-muted">`/personality`로도 바꿀 수 있습니다. Pragmatic은 짧게, Friendly는 이유를 한 줄 덧붙입니다.</p>
            </div>
          ) : null}
          {section === "모델" ? (
            <div className="space-y-4">
              <h1 className="text-xl font-medium">모델</h1>
              <ModelLibrary />
              <Field label="Ollama URL">
                <input className="field" value={draft.ollamaUrl} onChange={(event) => setDraft({ ...draft, ollamaUrl: event.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Temperature">
                  <input className="field" type="number" step="0.1" value={draft.temperature} onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })} />
                </Field>
                <Field label="Context length">
                  <input className="field" type="number" value={draft.contextLength} onChange={(event) => setDraft({ ...draft, contextLength: Number(event.target.value) })} />
                </Field>
                <Field label="Max iterations">
                  <input className="field" type="number" value={draft.maxIterations} onChange={(event) => setDraft({ ...draft, maxIterations: Number(event.target.value) })} />
                </Field>
                <Field label="Terminal timeout (ms)">
                  <input className="field" type="number" value={draft.terminalTimeoutMs} onChange={(event) => setDraft({ ...draft, terminalTimeoutMs: Number(event.target.value) })} />
                </Field>
              </div>
              <Field label="시스템 프롬프트">
                <textarea className="field h-40 font-mono text-xs" value={draft.systemPrompt || defaultPrompt} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} />
              </Field>
            </div>
          ) : null}
          {section === "권한" ? (
            <div className="space-y-3 text-sm">
              <h1 className="text-xl font-medium">권한</h1>
              <p className="text-muted">컴포저의 Default, Auto, Full access가 이번 실행의 승인 방식을 덮어씁니다. 여기 값은 그 선택을 하지 않았을 때의 기본입니다.</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.autoApproveSafe} onChange={(event) => setDraft({ ...draft, autoApproveSafe: event.target.checked })} />
                읽기와 조회는 자동 승인
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.autoApproveFileEdits} onChange={(event) => setDraft({ ...draft, autoApproveFileEdits: event.target.checked })} />
                작업 폴더 안의 수정, 설치, git add 자동 승인
              </label>
              <p className="text-xs text-muted">홈 디렉터리나 시스템 경로를 지우는 명령은 어떤 설정에서도 막습니다.</p>
            </div>
          ) : null}
          {section === "컴퓨터" ? (
            <div className="space-y-3 text-sm">
              <h1 className="text-xl font-medium">컴퓨터 사용</h1>
              <p className="text-muted">채팅에 @Computer를 넣으면 에이전트가 스크린샷과 손쉬운 사용으로 다른 앱을 조작할 수 있습니다. 화면 기록과 손쉬운 사용 권한이 필요합니다.</p>
              <div className="flex items-center gap-3">
                <span className="text-muted">손쉬운 사용: {accessibility ? "허용됨" : "필요"}</span>
                <button className="rounded-md border border-line px-3 py-1.5" onClick={() => void api.openAccessibilitySettings()}>
                  시스템 설정 열기
                </button>
              </div>
              <p className="text-xs text-muted">@Browser는 로그인된 브라우저 대신 주소만 엽니다. 클라우드 원격 제어와 Chrome 확장은 이 로컬 앱에 없습니다.</p>
            </div>
          ) : null}
          {section === "단축키" ? <Shortcuts /> : null}
          {section !== "단축키" && section !== "일반" && section !== "컴퓨터" ? (
            <div className="mt-5 flex gap-2">
              <button className="rounded-full bg-white px-4 py-2 text-sm text-black" onClick={() => void save()}>
                저장
              </button>
              {section === "모델" ? (
                <button
                  className="rounded-full border border-line px-4 py-2 text-sm"
                  onClick={() => {
                    const next = { ...draft, systemPrompt: "" };
                    setDraft(next);
                    void save(next);
                  }}
                >
                  프롬프트 초기화
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Shortcuts() {
  const rows = [
    ["새 채팅", "⌘N"],
    ["명령 메뉴", "⌘K"],
    ["설정", "⌘,"],
    ["폴더 열기", "⌘O"],
    ["사이드바", "⌘B"],
    ["작업 패널", "⌘J"],
    ["채팅에서 찾기", "⌘F"],
    ["다음 찾기", "⌘G"],
    ["터미널 탭", "⌃`"],
    ["글자 크기", "⌘+ / ⌘- / ⌘0"],
    ["승인", "Enter"],
    ["거부", "Esc"],
  ];
  return (
    <div>
      <h1 className="text-xl font-medium">단축키</h1>
      <div className="mt-4 divide-y divide-line border-y border-line">
        {rows.map(([label, keys]) => (
          <div key={label} className="flex items-center py-2 text-sm">
            <span>{label}</span>
            <span className="ml-auto text-muted">{keys}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 text-muted">{label}</div>
      {children}
    </label>
  );
}
