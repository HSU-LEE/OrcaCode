import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";

import { findUpdate, updateError } from "../lib/updates";
import { useUi } from "../stores/ui";

export function UpdateSection() {
  const setNotice = useUi((state) => state.setNotice);
  const pending = useRef<Update | null>(null);
  const [version, setVersion] = useState("0.1.0");
  const [available, setAvailable] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "checking" | "installing">("idle");

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => undefined);
    return () => {
      void pending.current?.close();
      pending.current = null;
    };
  }, []);

  async function look() {
    setPhase("checking");
    try {
      await pending.current?.close();
      pending.current = null;
      const found = await findUpdate();
      pending.current = found;
      setAvailable(found?.version ?? null);
      setNotice(found ? `버전 ${found.version} 업데이트가 있습니다.` : "이미 최신 버전입니다.");
    } catch (error) {
      const message = updateError(error);
      if (!message.includes("invoke")) setNotice(message);
    } finally {
      setPhase("idle");
    }
  }

  async function install() {
    const found = pending.current;
    if (!found) return;
    setPhase("installing");
    try {
      await found.downloadAndInstall();
      await relaunch();
    } catch (error) {
      const message = updateError(error);
      if (!message.includes("invoke")) setNotice(message);
      setPhase("idle");
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <div className="text-sm">Orca Code {version}</div>
          <div className="mt-0.5 text-xs text-muted">{available ? `설치 가능한 버전 ${available}` : "GitHub Releases에서 새 버전을 확인합니다."}</div>
        </div>
        <button className="ml-auto shrink-0 rounded-md border border-line bg-elev px-3 py-1.5 text-sm disabled:opacity-50" disabled={phase !== "idle"} onClick={() => void look()}>
          {phase === "checking" ? "확인 중" : "업데이트 확인"}
        </button>
      </div>
      {available ? (
        <button className="mt-3 rounded-md bg-text px-3 py-1.5 text-sm text-ink disabled:opacity-50" disabled={phase === "installing"} onClick={() => void install()}>
          {phase === "installing" ? "설치 중" : "설치하고 다시 시작"}
        </button>
      ) : null}
    </div>
  );
}
