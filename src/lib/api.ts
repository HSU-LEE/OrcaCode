import { invoke } from "@tauri-apps/api/core";

import type {
  ConversationDetail,
  ConversationSummary,
  ProcessInfo,
  Settings,
  WorkspaceRecord,
} from "../types";

export interface SettingsPayload {
  settings: Settings;
  defaultPrompt: string;
}

export function explain(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "요청을 처리하지 못했습니다.";
}

export const api = {
  getSettings: () => invoke<SettingsPayload>("get_settings"),
  saveSettings: (settings: Settings) => invoke<Settings>("save_settings", { settings }),
  listWorkspaces: () => invoke<WorkspaceRecord[]>("list_workspaces"),
  rememberWorkspace: (path: string) => invoke<WorkspaceRecord>("remember_workspace", { path }),
  listConversations: () => invoke<ConversationSummary[]>("list_conversations"),
  getConversation: (id: string) => invoke<ConversationDetail | null>("get_conversation", { id }),
  removeConversation: (id: string) => invoke<void>("remove_conversation", { id }),
  renameConversation: (id: string, title: string) => invoke<void>("rename_conversation", { id, title }),
  workspaceDiff: (path: string) => invoke<string>("workspace_diff", { path }),
  createWorktree: (repo: string) => invoke<string>("create_worktree", { repo }),
  openExternalUrl: (url: string) => invoke<void>("open_external_url", { url }),
  ollamaStatus: () => invoke<{ online: boolean; message: string }>("ollama_status"),
  ollamaModels: () => invoke<string[]>("ollama_models"),
  ollamaPresent: () => invoke<boolean>("ollama_present"),
  pullOllamaModel: (name: string) => invoke<void>("pull_ollama_model", { name }),
  installOllama: () => invoke<string>("install_ollama"),
  bootstrapRuntime: () => invoke<{ online: boolean; model: string; models: string[] }>("bootstrap_runtime"),
  ensureOllamaServer: () => invoke<void>("ensure_ollama_server"),
  startTask: (request: {
    conversationId: string | null;
    goal: string;
    mode: string;
    workspacePath: string;
    approval?: string;
    effort?: string;
    instructions?: string;
  }) => invoke<{ conversationId: string; taskId: string }>("start_task", { request }),
  cancelTask: () => invoke<void>("cancel_task"),
  respondPermission: (requestId: string, decision: "allow" | "once" | "deny") =>
    invoke<void>("respond_permission", { answer: { requestId, decision } }),
  undoTask: (taskId: string) => invoke<string[]>("undo_task", { taskId }),
  listProcesses: () => invoke<ProcessInfo[]>("list_processes"),
  readProcess: (id: string) => invoke<string>("read_process", { id }),
  stopProcess: (id: string) => invoke<string>("stop_process", { id }),
  accessibilityStatus: () => invoke<boolean>("accessibility_status"),
  openAccessibilitySettings: () => invoke<void>("open_accessibility_settings"),
};
