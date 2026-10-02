import { open } from "@tauri-apps/plugin-dialog";

import { api, explain } from "./api";
import { useSession } from "../stores/session";
import { useSettings } from "../stores/settings";

export async function selectWorkspace(path?: string) {
  const selected =
    path ??
    (await open({
      directory: true,
      multiple: false,
      title: "프로젝트 폴더",
    }));
  if (typeof selected !== "string") return null;
  const session = useSession.getState();
  try {
    const record = await api.rememberWorkspace(selected);
    session.setWorkspace(record.path);
    useSettings.getState().patch({ workspacePath: record.path });
    session.setWorkspaces(await api.listWorkspaces());
    await api.saveSettings({ ...useSettings.getState().settings, workspacePath: record.path });
    return record.path;
  } catch (error) {
    session.setBanner(explain(error));
    return null;
  }
}
