use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::domain::ToolOutput;
use crate::platform;
use crate::tools::context::ToolCtx;
use crate::util::new_id;

pub fn open_application(args: &Value) -> ToolOutput {
    let Some(name) = args.get("name").and_then(Value::as_str) else {
        return ToolOutput::fail("name이 필요합니다.");
    };
    if name.trim().is_empty() || name.contains('\0') {
        return ToolOutput::fail("애플리케이션 이름이 올바르지 않습니다.");
    }
    match Command::new("open").arg("-a").arg(name).status() {
        Ok(status) if status.success() => ToolOutput::ok(format!("{name}을 열었습니다.")),
        Ok(_) => ToolOutput::fail("애플리케이션을 열지 못했습니다."),
        Err(error) => ToolOutput::fail(format!("애플리케이션을 열지 못했습니다: {error}")),
    }
}

pub fn open_url(args: &Value) -> ToolOutput {
    let Some(url) = args.get("url").and_then(Value::as_str) else {
        return ToolOutput::fail("url이 필요합니다.");
    };
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return ToolOutput::fail("http 또는 https 주소만 열 수 있습니다.");
    }
    match Command::new("open").arg(url).status() {
        Ok(status) if status.success() => ToolOutput::ok(format!("열었습니다: {url}")),
        _ => ToolOutput::fail("주소를 열지 못했습니다."),
    }
}

pub fn screenshot(args: &Value, ctx: &ToolCtx) -> ToolOutput {
    let directory = ctx.workspace.join(".orca").join("screenshots");
    if let Err(error) = fs::create_dir_all(&directory) {
        return ToolOutput::fail(format!("스크린샷 폴더를 만들지 못했습니다: {error}"));
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let path = directory.join(format!("{stamp}-{}.jpg", &new_id()[..8]));
    let status = Command::new("screencapture")
        .arg("-x")
        .arg("-t")
        .arg("jpg")
        .arg(&path)
        .status();
    if !matches!(status, Ok(status) if status.success()) {
        return ToolOutput::fail("스크린샷을 찍지 못했습니다.");
    }
    let _ = Command::new("sips").arg("-Z").arg("1280").arg(&path).status();
    let display = path.display().to_string();
    let mut output = ToolOutput::ok(if ctx.vision {
        format!("screenshot: {display}")
    } else {
        format!("screenshot: {display}\n현재 모델은 이미지를 볼 수 없습니다. 파일 경로만 전달합니다.")
    });
    if ctx.vision {
        if let Ok(bytes) = fs::read(&path) {
            if bytes.len() <= 4_000_000 {
                output.images.push(encode_base64(&bytes));
            }
        }
    }
    let _ = args;
    output
}

pub fn keyboard_type(args: &Value) -> ToolOutput {
    let Some(text) = args.get("text").and_then(Value::as_str) else {
        return ToolOutput::fail("text가 필요합니다.");
    };
    match platform::keystroke(text) {
        Ok(()) => ToolOutput::ok("키보드 입력을 전달했습니다."),
        Err(error) => ToolOutput::fail(error),
    }
}

pub fn keyboard_shortcut(args: &Value) -> ToolOutput {
    let Some(key) = args.get("key").and_then(Value::as_str) else {
        return ToolOutput::fail("key가 필요합니다.");
    };
    let modifiers: Vec<String> = args
        .get("modifiers")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    match platform::shortcut(key, &modifiers) {
        Ok(()) => ToolOutput::ok("단축키를 전달했습니다."),
        Err(error) => ToolOutput::fail(error),
    }
}

pub fn mouse_click(args: &Value) -> ToolOutput {
    let Some((x, y)) = point(args) else {
        return ToolOutput::fail("x와 y가 필요합니다.");
    };
    let button = args.get("button").and_then(Value::as_str).unwrap_or("left");
    match platform::mouse_click(x, y, button) {
        Ok(()) => ToolOutput::ok(format!("클릭했습니다: {x}, {y}")),
        Err(error) => ToolOutput::fail(error),
    }
}

pub fn mouse_move(args: &Value) -> ToolOutput {
    let Some((x, y)) = point(args) else {
        return ToolOutput::fail("x와 y가 필요합니다.");
    };
    match platform::mouse_move(x, y) {
        Ok(()) => ToolOutput::ok(format!("이동했습니다: {x}, {y}")),
        Err(error) => ToolOutput::fail(error),
    }
}

pub fn scroll(args: &Value) -> ToolOutput {
    let Some((x, y)) = point(args) else {
        return ToolOutput::fail("x와 y가 필요합니다.");
    };
    let dy = args.get("dy").and_then(Value::as_i64).unwrap_or(-3) as i32;
    match platform::scroll(x, y, dy) {
        Ok(()) => ToolOutput::ok(format!("스크롤했습니다: {dy}")),
        Err(error) => ToolOutput::fail(error),
    }
}

fn point(args: &Value) -> Option<(f64, f64)> {
    let x = args.get("x")?.as_f64().or_else(|| args.get("x")?.as_i64().map(|value| value as f64))?;
    let y = args.get("y")?.as_f64().or_else(|| args.get("y")?.as_i64().map(|value| value as f64))?;
    Some((x, y))
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (a << 16) | (b << 8) | c;
        out.push(TABLE[((triple >> 18) & 63) as usize] as char);
        out.push(TABLE[((triple >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}
