use serde::Serialize;
use serde_json::Value;

use crate::domain::{FileChange, PlanStep};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionPrompt {
    pub id: String,
    pub tool: String,
    pub arguments: Value,
    pub risk: String,
    pub summary: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AgentEvent {
    State {
        state: String,
        detail: Option<String>,
    },
    Token {
        text: String,
    },
    AssistantDone {
        content: String,
    },
    ToolStarted {
        id: String,
        name: String,
        arguments: Value,
        risk: String,
    },
    ToolFinished {
        id: String,
        success: bool,
        content: String,
        status: String,
    },
    Plan {
        steps: Vec<PlanStep>,
    },
    Permission {
        request: PermissionPrompt,
    },
    FileChange {
        change: FileChange,
    },
    Error {
        message: String,
    },
}
