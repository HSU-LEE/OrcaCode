use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use crate::agent::cancel::CancelFlag;
use crate::storage::database::Database;
use crate::tools::process::ProcessManager;

#[derive(Clone)]
pub struct ToolCtx {
    pub workspace: PathBuf,
    pub task_id: String,
    pub cancel: CancelFlag,
    pub timeout: Duration,
    pub db: Arc<Database>,
    pub processes: Arc<ProcessManager>,
    pub vision: bool,
}
