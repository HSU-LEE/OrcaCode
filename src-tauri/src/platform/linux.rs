pub fn os_name() -> &'static str {
    "linux"
}

pub fn accessibility_trusted() -> bool {
    false
}

pub fn open_accessibility_settings() -> Result<(), String> {
    Err("Linux 접근성 설정 연결은 아직 구현되지 않았습니다.".into())
}

pub fn mouse_click(_x: f64, _y: f64, _button: &str) -> Result<(), String> {
    unsupported()
}

pub fn mouse_move(_x: f64, _y: f64) -> Result<(), String> {
    unsupported()
}

pub fn scroll(_x: f64, _y: f64, _dy: i32) -> Result<(), String> {
    unsupported()
}

pub fn keystroke(_text: &str) -> Result<(), String> {
    unsupported()
}

pub fn shortcut(_key: &str, _modifiers: &[String]) -> Result<(), String> {
    unsupported()
}

fn unsupported() -> Result<(), String> {
    Err("이 운영체제에서는 아직 GUI 제어를 지원하지 않습니다.".into())
}
