use std::process::Command;

pub fn os_name() -> &'static str {
    "macos"
}

pub fn accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

pub fn open_accessibility_settings() -> Result<(), String> {
    let status = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility")
        .status()
        .map_err(|error| format!("시스템 설정을 열지 못했습니다: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("시스템 설정을 열지 못했습니다.".into())
    }
}

pub fn mouse_click(x: f64, y: f64, button: &str) -> Result<(), String> {
    ensure_access()?;
    let (down, up, mouse_button) = match button {
        "right" => (3u32, 4u32, 1u32),
        _ => (1u32, 2u32, 0u32),
    };
    post_mouse(down, x, y, mouse_button)?;
    post_mouse(up, x, y, mouse_button)?;
    Ok(())
}

pub fn mouse_move(x: f64, y: f64) -> Result<(), String> {
    ensure_access()?;
    post_mouse(5, x, y, 0)
}

pub fn scroll(x: f64, y: f64, dy: i32) -> Result<(), String> {
    ensure_access()?;
    unsafe {
        let event = CGEventCreate(std::ptr::null_mut());
        if event.is_null() {
            return Err("스크롤 이벤트를 만들지 못했습니다.".into());
        }
        CGEventSetType(event, 22);
        CGEventSetLocation(event, CGPoint { x, y });
        CGEventSetIntegerValueField(event, 11, dy as i64);
        CGEventSetIntegerValueField(event, 96, (dy * 10) as i64);
        CGEventPost(0, event);
        CFRelease(event);
    }
    Ok(())
}

pub fn keystroke(text: &str) -> Result<(), String> {
    ensure_access()?;
    if text.chars().count() > 2_000 {
        return Err("한 번에 입력할 수 있는 글자 수를 넘었습니다.".into());
    }
    let script = format!(
        "tell application \"System Events\" to keystroke \"{}\"",
        applescript_escape(text)
    );
    run_osascript(&script)
}

pub fn shortcut(key: &str, modifiers: &[String]) -> Result<(), String> {
    ensure_access()?;
    let using = modifiers
        .iter()
        .filter_map(|modifier| match modifier.to_ascii_lowercase().as_str() {
            "command" | "cmd" | "meta" => Some("command down"),
            "option" | "alt" => Some("option down"),
            "control" | "ctrl" => Some("control down"),
            "shift" => Some("shift down"),
            _ => None,
        })
        .collect::<Vec<_>>();
    let modifier_clause = if using.is_empty() {
        String::new()
    } else {
        format!(" using {{{}}}", using.join(", "))
    };
    let script = if let Some(code) = key_code(key) {
        format!("tell application \"System Events\" to key code {code}{modifier_clause}")
    } else if key.chars().count() == 1 {
        format!(
            "tell application \"System Events\" to keystroke \"{}\"{modifier_clause}",
            applescript_escape(key)
        )
    } else {
        return Err("지원하지 않는 키입니다.".into());
    };
    run_osascript(&script)
}

fn ensure_access() -> Result<(), String> {
    if accessibility_trusted() {
        Ok(())
    } else {
        Err("손쉬운 사용 권한이 없습니다. 설정에서 Orca Code를 허용한 뒤 다시 시도해주세요.".into())
    }
}

fn post_mouse(kind: u32, x: f64, y: f64, button: u32) -> Result<(), String> {
    unsafe {
        let event = CGEventCreateMouseEvent(std::ptr::null_mut(), kind, CGPoint { x, y }, button);
        if event.is_null() {
            return Err("마우스 이벤트를 만들지 못했습니다.".into());
        }
        CGEventPost(0, event);
        CFRelease(event);
    }
    Ok(())
}

fn run_osascript(script: &str) -> Result<(), String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| format!("AppleScript를 실행하지 못했습니다: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        crate::logging::log_line("error", &format!("osascript: {stderr}"));
        Err("키보드 입력을 전달하지 못했습니다. 손쉬운 사용 권한을 확인해주세요.".into())
    }
}

fn applescript_escape(text: &str) -> String {
    text.replace('\\', "\\\\").replace('"', "\\\"")
}

fn key_code(key: &str) -> Option<u16> {
    Some(match key.to_ascii_lowercase().as_str() {
        "enter" | "return" => 36,
        "escape" | "esc" => 53,
        "tab" => 48,
        "delete" | "backspace" => 51,
        "forwarddelete" => 117,
        "up" => 126,
        "down" => 125,
        "left" => 123,
        "right" => 124,
        "space" => 49,
        _ => return None,
    })
}

#[repr(C)]
struct CGPoint {
    x: f64,
    y: f64,
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventCreateMouseEvent(
        source: *mut std::ffi::c_void,
        mouse_type: u32,
        position: CGPoint,
        button: u32,
    ) -> *mut std::ffi::c_void;
    fn CGEventCreate(source: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn CGEventSetType(event: *mut std::ffi::c_void, event_type: u32);
    fn CGEventSetLocation(event: *mut std::ffi::c_void, location: CGPoint);
    fn CGEventSetIntegerValueField(event: *mut std::ffi::c_void, field: u32, value: i64);
    fn CGEventPost(tap: u32, event: *mut std::ffi::c_void);
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(value: *mut std::ffi::c_void);
}
