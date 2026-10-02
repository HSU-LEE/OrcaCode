use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::agent::cancel::CancelFlag;

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
    pub cancelled: bool,
    pub error: Option<String>,
}

impl CommandOutput {
    pub fn succeeded(&self) -> bool {
        self.error.is_none() && !self.timed_out && !self.cancelled && self.exit_code == Some(0)
    }
}

pub fn run_command(
    command: &str,
    cwd: &Path,
    timeout: Duration,
    cancel: &CancelFlag,
) -> CommandOutput {
    if command.trim().is_empty() {
        return failed("빈 명령은 실행할 수 없습니다.");
    }
    if command.len() > 20_000 {
        return failed("명령이 너무 깁니다.");
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut process = Command::new(shell);
    process
        .arg("-lc")
        .arg(command)
        .current_dir(cwd)
        .env("ORCA_AGENT", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        process.process_group(0);
    }
    let mut child = match process.spawn() {
        Ok(child) => child,
        Err(error) => {
            crate::logging::log_line("error", &format!("spawn failed: {error}"));
            return failed("명령을 시작하지 못했습니다. 셸이 사용 가능한지 확인해주세요.");
        }
    };
    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_buf = Arc::new(Mutex::new(String::new()));
    let stderr_buf = Arc::new(Mutex::new(String::new()));
    let stdout_thread = stdout.map(|reader| spawn_reader(reader, Arc::clone(&stdout_buf)));
    let stderr_thread = stderr.map(|reader| spawn_reader(reader, Arc::clone(&stderr_buf)));
    let started = Instant::now();
    let mut timed_out = false;
    let mut cancelled = false;
    let status = loop {
        if cancel.is_cancelled() {
            cancelled = true;
            kill_pid(pid);
            break child.wait().ok();
        }
        if started.elapsed() > timeout {
            timed_out = true;
            kill_pid(pid);
            break child.wait().ok();
        }
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => thread::sleep(Duration::from_millis(40)),
            Err(error) => {
                kill_pid(pid);
                let _ = child.wait();
                return CommandOutput {
                    exit_code: None,
                    stdout: take_text(&stdout_buf),
                    stderr: take_text(&stderr_buf),
                    timed_out: false,
                    cancelled: false,
                    error: Some(format!("명령 상태를 확인하지 못했습니다: {error}")),
                };
            }
        }
    };
    if let Some(handle) = stdout_thread {
        let _ = handle.join();
    }
    if let Some(handle) = stderr_thread {
        let _ = handle.join();
    }
    CommandOutput {
        exit_code: status.and_then(|status| status.code()),
        stdout: take_text(&stdout_buf),
        stderr: take_text(&stderr_buf),
        timed_out,
        cancelled,
        error: None,
    }
}

pub fn run_git(workspace: &Path, args: &[String], timeout: Duration, cancel: &CancelFlag) -> CommandOutput {
    let mut process = Command::new("git");
    process
        .args(args)
        .current_dir(workspace)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        process.process_group(0);
    }
    let mut child = match process.spawn() {
        Ok(child) => child,
        Err(error) => {
            crate::logging::log_line("error", &format!("git spawn: {error}"));
            return failed("git 명령을 시작하지 못했습니다. git이 설치되어 있는지 확인해주세요.");
        }
    };
    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_buf = Arc::new(Mutex::new(String::new()));
    let stderr_buf = Arc::new(Mutex::new(String::new()));
    let stdout_thread = stdout.map(|reader| spawn_reader(reader, Arc::clone(&stdout_buf)));
    let stderr_thread = stderr.map(|reader| spawn_reader(reader, Arc::clone(&stderr_buf)));
    let started = Instant::now();
    let mut timed_out = false;
    let mut cancelled = false;
    let status = loop {
        if cancel.is_cancelled() {
            cancelled = true;
            kill_pid(pid);
            break child.wait().ok();
        }
        if started.elapsed() > timeout {
            timed_out = true;
            kill_pid(pid);
            break child.wait().ok();
        }
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => thread::sleep(Duration::from_millis(30)),
            Err(error) => {
                return CommandOutput {
                    exit_code: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    timed_out: false,
                    cancelled: false,
                    error: Some(format!("git 실행에 실패했습니다: {error}")),
                };
            }
        }
    };
    if let Some(handle) = stdout_thread {
        let _ = handle.join();
    }
    if let Some(handle) = stderr_thread {
        let _ = handle.join();
    }
    CommandOutput {
        exit_code: status.and_then(|status| status.code()),
        stdout: take_text(&stdout_buf),
        stderr: take_text(&stderr_buf),
        timed_out,
        cancelled,
        error: None,
    }
}

fn spawn_reader(mut reader: impl Read + Send + 'static, output: Arc<Mutex<String>>) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let text = String::from_utf8_lossy(&buffer[..size]);
                    append_capped(&output, &text);
                }
                Err(_) => break,
            }
        }
    })
}

fn append_capped(output: &Mutex<String>, text: &str) {
    let Ok(mut slot) = output.lock() else {
        return;
    };
    slot.push_str(text);
    if slot.len() > 160_000 {
        let mut cut = slot.len() - 120_000;
        while cut < slot.len() && !slot.is_char_boundary(cut) {
            cut += 1;
        }
        slot.drain(..cut);
    }
}

fn take_text(output: &Mutex<String>) -> String {
    output.lock().map(|mut text| std::mem::take(&mut *text)).unwrap_or_default()
}

pub fn kill_pid(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(pid as i32), libc::SIGTERM);
        thread::sleep(Duration::from_millis(120));
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
    }
}

fn failed(message: &str) -> CommandOutput {
    CommandOutput {
        exit_code: None,
        stdout: String::new(),
        stderr: String::new(),
        timed_out: false,
        cancelled: false,
        error: Some(message.to_string()),
    }
}

pub fn format_command_result(command: &str, cwd: &Path, output: &CommandOutput) -> String {
    let code = output
        .exit_code
        .map(|code| code.to_string())
        .unwrap_or_else(|| "null".into());
    format!(
        "command: {command}\ncwd: {}\nexit_code: {code}\ntimed_out: {}\ncancelled: {}\nerror: {}\n--- stdout ---\n{}\n--- stderr ---\n{}",
        cwd.display(),
        output.timed_out,
        output.cancelled,
        output.error.clone().unwrap_or_default(),
        output.stdout,
        output.stderr
    )
}

