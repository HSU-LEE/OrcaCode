import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { Logo } from "./Logo";

interface Progress {
  status: string;
  completed: number;
  total: number;
}

export function SetupScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const [line, setLine] = useState("Ollama와 기본 모델을 준비하는 중");
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    let stop = () => {};
    void listen<Progress>("ollama-progress", (event) => {
      setLine(event.payload.status || "준비하는 중");
      if (event.payload.total > 0) {
        setRatio(Math.max(0, Math.min(1, event.payload.completed / event.payload.total)));
      }
    }).then((unlisten) => {
      stop = unlisten;
    });
    return () => stop();
  }, []);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/95 px-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel-2 px-6 py-7">
        <Logo className="mb-4 h-12 w-12" />
        <h1 className="text-lg font-medium">Orca Code 준비</h1>
        <p className="mt-2 text-sm text-muted">Ollama와 기본 모델 qwen2.5-coder:7b를 이 기기에 준비합니다. 처음에는 내려받는 데 시간이 걸립니다.</p>
        <p className="mt-4 text-sm">{error ?? line}</p>
        {ratio !== null && !error ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-elev">
            <div className="h-full bg-text" style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
        ) : null}
        {error ? (
          <button className="mt-5 rounded-lg bg-text px-3 py-1.5 text-sm text-ink" onClick={onRetry}>
            다시 시도
          </button>
        ) : null}
      </div>
    </div>
  );
}
