import { check, type Update } from "@tauri-apps/plugin-updater";

import { explain } from "./api";

export async function findUpdate(): Promise<Update | null> {
  return check();
}

export function updateError(error: unknown): string {
  const message = explain(error);
  if (/fetch|network|endpoint|release|timed out|offline|404/i.test(message)) {
    return "업데이트 정보를 가져오지 못했습니다. 배포가 없거나 네트워크에 연결되지 않았습니다.";
  }
  return message;
}
