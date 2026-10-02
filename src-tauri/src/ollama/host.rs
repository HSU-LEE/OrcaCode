use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

pub struct OllamaHost {
    started_by_app: AtomicBool,
    launched_app: AtomicBool,
    child: Mutex<Option<Child>>,
}

impl OllamaHost {
    pub fn new() -> Self {
        Self {
            started_by_app: AtomicBool::new(false),
            launched_app: AtomicBool::new(false),
            child: Mutex::new(None),
        }
    }

    pub fn mark_started(&self) {
        self.started_by_app.store(true, Ordering::SeqCst);
    }

    pub fn mark_launched_app(&self) {
        self.launched_app.store(true, Ordering::SeqCst);
        self.mark_started();
    }

    pub fn store_child(&self, child: Child) {
        if let Ok(mut slot) = self.child.lock() {
            if let Some(mut previous) = slot.replace(child) {
                let _ = previous.kill();
                let _ = previous.wait();
            }
        }
        self.mark_started();
    }

    pub fn shutdown(&self) {
        if !self.started_by_app.swap(false, Ordering::SeqCst) {
            return;
        }
        if let Ok(mut slot) = self.child.lock() {
            if let Some(mut child) = slot.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        if !self.launched_app.swap(false, Ordering::SeqCst) {
            return;
        }
        let _ = Command::new("osascript")
            .args(["-e", "tell application \"Ollama\" to quit"])
            .status();
        let _ = Command::new("killall").arg("Ollama").status();
    }
}
