import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { api, explain } from "../lib/api";
import { useSession } from "../stores/session";
import { useSettings } from "../stores/settings";
import { useUi } from "../stores/ui";

const catalog = [
  { name: "qwen2.5-coder:7b", detail: "코딩에 맞는 기본 모델" },
  { name: "qwen2.5-coder:14b", detail: "더 긴 작업을 위한 코딩 모델" },
  { name: "qwen2.5:7b", detail: "일반 작업용" },
  { name: "llama3.1:8b", detail: "범용 대화 모델" },
  { name: "gemma2:9b", detail: "가벼운 범용 모델" },
  { name: "deepseek-coder-v2:16b", detail: "코드 분석용" },
  { name: "mistral:7b", detail: "빠른 범용 모델" },
  { name: "phi3:3.8b", detail: "작은 기기용" },
];

interface Progress {
  kind: string;
  status: string;
  completed: number;
  total: number;
  done: boolean;
  error?: string | null;
}

export function ModelLibrary() {
  const models = useSession((state) => state.models);
  const online = useSession((state) => state.ollamaOnline);
  const message = useSession((state) => state.ollamaMessage);
  const setOllama = useSession((state) => state.setOllama);
  const setBanner = useSession((state) => state.setBanner);
  const setNotice = useUi((state) => state.setNotice);
  const settings = useSettings((state) => state.settings);
  const patch = useSettings((state) => state.patch);
  const setSettings = useSettings((state) => state.setSettings);
  const [present, setPresent] = useState<boolean | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);

  async function refresh() {
    const status = await api.ollamaStatus();
    const installed = status.online ? await api.ollamaModels().catch(() => []) : [];
    setOllama(status.online, status.message, installed);
    setPresent(await api.ollamaPresent().catch(() => false));
  }

  useEffect(() => {
    void refresh().catch((error) => setBanner(explain(error)));
    let unlisten: (() => void) | undefined;
    void listen<Progress>("ollama-progress", (event) => setProgress(event.payload))
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, [setBanner, setOllama]);

  async function choose(name: string) {
    const next = { ...settings, model: name };
    patch({ model: name });
    try {
      setSettings(await api.saveSettings(next));
    } catch (error) {
      setBanner(explain(error));
    }
  }

  async function pull(name: string) {
    const model = name.trim();
    if (!model || busy) return;
    setBusy(true);
    setProgress({ kind: "model", status: `${model} 받는 중`, completed: 0, total: 0, done: false });
    try {
      await api.pullOllamaModel(model);
      await refresh();
      await choose(model);
      setCustom("");
    } catch (error) {
      setBanner(explain(error));
    } finally {
      setBusy(false);
    }
  }

  async function installApp() {
    if (busy) return;
    setBusy(true);
    setProgress({ kind: "app", status: "Ollama를 준비하는 중", completed: 0, total: 0, done: false });
    try {
      const result = await api.installOllama();
      setNotice(result);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        await refresh();
        if (useSession.getState().ollamaOnline) break;
      }
    } catch (error) {
      setBanner(explain(error));
    } finally {
      setBusy(false);
    }
  }

  const ratio = progress && progress.total > 0 ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0;
  const installedNames = new Set(models);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-panel-2 px-3 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-ok" : "bg-danger"}`} />
          <span>{online ? "Ollama가 실행 중입니다." : present ? "Ollama가 설치되어 있지만 꺼져 있습니다." : "Ollama가 설치되어 있지 않습니다."}</span>
        </div>
        {!online ? <p className="mt-2 text-xs text-muted">{message}</p> : null}
        {!online ? (
          <button className="mt-3 rounded-full bg-white px-3 py-1.5 text-sm text-black disabled:opacity-40" disabled={busy} onClick={() => void installApp()}>
            {present ? "Ollama 실행" : "Ollama 설치"}
          </button>
        ) : null}
      </div>
      {progress && !progress.done ? (
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{progress.status}</span>
            {progress.total > 0 ? <span>{ratio}%</span> : null}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-elev">
            <div className="h-full bg-white" style={{ width: progress.total > 0 ? `${ratio}%` : "30%" }} />
          </div>
        </div>
      ) : null}
      <div>
        <div className="mb-2 text-sm text-muted">설치된 모델</div>
        {models.length === 0 ? <p className="text-sm text-muted">아직 설치된 모델이 없습니다.</p> : null}
        <div className="space-y-1">
          {models.map((model) => (
            <button
              key={model}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm ${settings.model === model ? "bg-elev" : "hover:bg-elev"}`}
              onClick={() => void choose(model)}
            >
              <span className="truncate">{model}</span>
              {settings.model === model ? <span className="ml-auto text-xs text-muted">사용 중</span> : null}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-sm text-muted">설치할 모델</div>
        <div className="space-y-1">
          {catalog.map((item) => {
            const installed = [...installedNames].some((name) => name === item.name || name.startsWith(item.name));
            return (
              <div key={item.name} className="flex items-center gap-3 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{item.name}</div>
                  <div className="text-xs text-muted">{item.detail}</div>
                </div>
                {installed ? (
                  <span className="text-xs text-muted">설치됨</span>
                ) : (
                  <button className="rounded-full border border-line px-3 py-1 text-xs disabled:opacity-40" disabled={!online || busy} onClick={() => void pull(item.name)}>
                    설치
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void pull(custom);
          }}
        >
          <input className="field" placeholder="모델 이름, 예: qwen2.5-coder:7b" value={custom} onChange={(event) => setCustom(event.target.value)} />
          <button className="shrink-0 rounded-full bg-white px-4 text-sm text-black disabled:opacity-40" disabled={!online || busy || !custom.trim()}>
            설치
          </button>
        </form>
      </div>
    </div>
  );
}
