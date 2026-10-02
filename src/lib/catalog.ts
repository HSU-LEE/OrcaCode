export type Effort = "low" | "medium" | "high" | "xhigh";
export type Approval = "default" | "auto" | "full";
export type Personality = "pragmatic" | "friendly";
export type RunMode = "ask" | "plan" | "agent";
export type Cadence = "hourly" | "daily" | "weekly";

export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  builtin?: boolean;
}

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  workspacePath: string;
  cadence: Cadence;
  enabled: boolean;
  lastRun: number;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  instruction: string;
}

export const PLUGINS: Plugin[] = [
  {
    id: "documents",
    name: "Documents",
    description: "문서를 만들고 고칩니다",
    instruction:
      "Documents plugin: write or edit a clear document in the workspace as Markdown. Keep headings, and do not invent facts that are not in the project.",
  },
  {
    id: "pdf",
    name: "PDF",
    description: "PDF로 읽을 수 있는 문서를 만듭니다",
    instruction:
      "PDF plugin: produce a print-ready document. Write Markdown, then if a local tool can render PDF, do that inside the workspace. Otherwise leave the Markdown and say how to export it.",
  },
  {
    id: "spreadsheets",
    name: "Spreadsheets",
    description: "표와 CSV를 다룹니다",
    instruction:
      "Spreadsheets plugin: read or write CSV in the workspace. Show the columns you will change before rewriting a file, and never drop a row without saying so.",
  },
  {
    id: "presentations",
    name: "Presentations",
    description: "슬라이드 초안을 만듭니다",
    instruction:
      "Presentations plugin: create a slide deck as Markdown or a simple HTML file in the workspace. One idea per slide, short lines, no filler.",
  },
];

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: "review",
    name: "review",
    description: "커밋 전 변경을 검토합니다",
    builtin: true,
    body: "Review the uncommitted diff. List real risks, missing tests, and anything that should be reverted. Do not edit files.",
  },
  {
    id: "skill-creator",
    name: "skill-creator",
    description: "반복 작업을 스킬로 정리합니다",
    builtin: true,
    body: "Help the user define a reusable skill. Ask what should trigger it, then write a name, a one-line description, and the instructions. Do not save secrets into the skill.",
  },
];

export const SLASH = [
  { id: "goal", label: "Goal", detail: "이 스레드가 계속 따라갈 목표를 정합니다" },
  { id: "plan", label: "Plan mode", detail: "계획만 세우고 파일은 수정하지 않습니다" },
  { id: "model", label: "Model", detail: "모델과 추론 강도를 고릅니다" },
  { id: "fast", label: "Fast", detail: "얕은 작업에 맞게 추론을 낮춥니다" },
  { id: "chat", label: "Chat", detail: "읽기 전용으로 전환합니다" },
  { id: "review", label: "Review", detail: "커밋되지 않은 변경을 검토합니다" },
  { id: "status", label: "Status", detail: "스레드와 컨텍스트 상태를 봅니다" },
  { id: "personality", label: "Personality", detail: "답변 성격을 바꿉니다" },
] as const;

export function effortLabel(effort: Effort): string {
  if (effort === "low") return "Low";
  if (effort === "high") return "High";
  if (effort === "xhigh") return "Extra high";
  return "Medium";
}

export function approvalLabel(approval: Approval): string {
  if (approval === "default") return "Default";
  if (approval === "full") return "Full access";
  return "Auto";
}

export function runModeLabel(mode: RunMode): string {
  if (mode === "ask") return "Ask";
  if (mode === "plan") return "Plan";
  return "Agent";
}

export function cadenceMs(cadence: Cadence): number {
  if (cadence === "hourly") return 60 * 60 * 1000;
  if (cadence === "weekly") return 7 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function buildInstructions(input: {
  text: string;
  personality: Personality;
  effort: Effort;
  goal: string;
  skills: Skill[];
  enabledPlugins: string[];
}): string {
  const lines = [
    input.personality === "friendly"
      ? "Personality: warm and clear. Explain the decision in a sentence, then do the work."
      : "Personality: terse and pragmatic. Lead with the result.",
  ];
  if (input.effort === "low") lines.push("Reasoning effort is low. Take the shortest safe path.");
  if (input.effort === "high") lines.push("Reasoning effort is high. Check edge cases before you finish.");
  if (input.effort === "xhigh") lines.push("Reasoning effort is extra high. Inspect the result before you stop.");
  if (input.goal.trim()) lines.push(`Persistent goal, keep working toward it:\n${input.goal.trim()}`);
  for (const skill of input.skills) {
    if (input.text.includes(`$${skill.name}`)) {
      lines.push(`Skill $${skill.name}: ${skill.description}\n${skill.body}`);
    }
  }
  for (const plugin of PLUGINS) {
    if (input.enabledPlugins.includes(plugin.id) && input.text.includes(`@${plugin.name}`)) {
      lines.push(plugin.instruction);
    }
  }
  if (input.text.includes("@Computer")) {
    lines.push(
      "Computer use was requested. You may use screenshot and GUI tools for the named app. Stay on that task, and prefer files or the terminal for code.",
    );
  }
  if (input.text.includes("@Browser")) {
    lines.push("Browser was requested. Open http(s) pages with open_url. You do not have a signed-in browser profile.");
  }
  return lines.join("\n\n");
}
