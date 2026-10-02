use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use walkdir::WalkDir;

use crate::domain::{FileChange, ToolOutput};
use crate::safety::paths::{is_critical_path, relative_display, resolve_path, should_skip_dir};
use crate::safety::truncate::truncate_observation;
use crate::tools::context::ToolCtx;
use crate::tools::edit::{apply_replacement, apply_unified_diff, unified_diff, EditError};

pub fn list_directory(args: &Value, ctx: &ToolCtx) -> ToolOutput {
    let raw = args.get("path").and_then(Value::as_str).unwrap_or(".");
    let resolved = match resolve_path(&ctx.workspace, raw) {
        Ok(path) => path,
        Err(_) => return ToolOutput::fail("경로가 비어 있습니다."),
    };
    if !resolved.path.exists() {
        return ToolOutput::fail(format!("경로가 없습니다: {}", resolved.path.display()));
    }
    if !resolved.path.is_dir() {
        return ToolOutput::fail("디렉터리가 아닙니다.");
    }
    let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(200).clamp(1, 500) as usize;
    let entries = match fs::read_dir(&resolved.path) {
        Ok(entries) => entries,
        Err(error) => return ToolOutput::fail(format!("디렉터리를 읽지 못했습니다: {error}")),
    };
    let mut lines = Vec::new();
    let mut count = 0;
    let mut items: Vec<_> = entries.flatten().collect();
    items.sort_by_key(|entry| entry.file_name());
    for entry in items {
        if count >= limit {
            lines.push(format!("... {limit}개까지만 표시합니다."));
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let kind = if entry.path().is_dir() { "dir" } else { "file" };
        let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
        lines.push(format!("{kind}\t{size}\t{name}"));
        count += 1;
    }
    ToolOutput::ok(format!(
        "directory: {}\n{}",
        relative_display(&ctx.workspace, &resolved.path),
        lines.join("\n")
    ))
}

pub fn read_file(args: &Value, ctx: &ToolCtx) -> ToolOutput {
    let Some(raw) = args.get("path").and_then(Value::as_str) else {
        return ToolOutput::fail("path가 필요합니다.");
    };
    let resolved = match resolve_path(&ctx.workspace, raw) {
        Ok(path) => path,
        Err(_) => return ToolOutput::fail("경로가 비어 있습니다."),
    };
    if !resolved.path.is_file() {
        return ToolOutput::fail(format!("파일이 없습니다: {}", resolved.path.display()));
    }
    let metadata = match fs::metadata(&resolved.path) {
        Ok(metadata) => metadata,
        Err(error) => return ToolOutput::fail(format!("파일을 확인하지 못했습니다: {error}")),
    };
    if metadata.len() > 2_000_000 {
        return ToolOutput::fail("2MB보다 큰 파일은 범위 없이 읽지 않습니다. start_line과 end_line으로 나눠 읽으세요.");
    }
    let text = match fs::read(&resolved.path) {
        Ok(bytes) => {
            if bytes.contains(&0) {
                return ToolOutput::fail("바이너리 파일은 읽지 않습니다.");
            }
            String::from_utf8_lossy(&bytes).to_string()
        }
        Err(error) => return ToolOutput::fail(format!("파일을 읽지 못했습니다: {error}")),
    };
    let lines: Vec<&str> = text.split('\n').collect();
    let total = lines.len();
    let start = args.get("start_line").and_then(Value::as_u64).unwrap_or(1).max(1) as usize;
    let mut end = args
        .get("end_line")
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(start + 199);
    if end < start {
        end = start;
    }
    if end - start > 399 {
        end = start + 399;
    }
    let start_index = start.saturating_sub(1).min(total);
    let end_index = end.min(total);
    let mut body = String::new();
    for (offset, line) in lines[start_index..end_index].iter().enumerate() {
        body.push_str(&format!("{:>6}|{}\n", start_index + offset + 1, line));
    }
    ToolOutput::ok(format!(
        "file: {}\nlines: {}-{} of {total}\n{body}",
        relative_display(&ctx.workspace, &resolved.path),
        start_index + 1,
        end_index
    ))
}

pub fn write_file(args: &Value, ctx: &ToolCtx) -> ToolOutput {
    let Some(raw) = args.get("path").and_then(Value::as_str) else {
        return ToolOutput::fail("path가 필요합니다.");
    };
    let Some(content) = args.get("content").and_then(Value::as_str) else {
        return ToolOutput::fail("content가 필요합니다.");
    };
    let resolved = match resolve_path(&ctx.workspace, raw) {
        Ok(path) => path,
        Err(_) => return ToolOutput::fail("경로가 비어 있습니다."),
    };
    if is_critical_path(&resolved.path) || resolved.path == ctx.workspace {
        return ToolOutput::fail("이 경로는 생성할 수 없습니다.");
    }
    if resolved.path.exists() {
        return ToolOutput::fail("이미 있는 파일입니다. write_file 대신 edit_file을 사용하세요.");
    }
    if let Err(error) = capture(ctx, &resolved.path) {
        return error;
    }
    if let Some(parent) = resolved.path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            return ToolOutput::fail(format!("상위 폴더를 만들지 못했습니다: {error}"));
        }
    }
    if let Err(error) = fs::write(&resolved.path, content) {
        return ToolOutput::fail(format!("파일을 쓰지 못했습니다: {error}"));
    }
    let diff = unified_diff("", content);
    let change = record_change(ctx, &resolved.path, "added", &diff);
    let mut output = ToolOutput::ok(format!("created {}", relative_display(&ctx.workspace, &resolved.path)));
    output.file_changes = vec![change];
    output.mutated = true;
    output
}

pub fn edit_file(args: &Value, ctx: &ToolCtx) -> ToolOutput {
    let Some(raw) = args.get("path").and_then(Value::as_str) else {
        return ToolOutput::fail("path가 필요합니다.");
    };
    let resolved = match resolve_path(&ctx.workspace, raw) {
        Ok(path) => path,
        Err(_) => return ToolOutput::fail("경로가 비어 있습니다."),
    };
    if !resolved.path.is_file() {
        return ToolOutput::fail("수정할 파일이 없습니다. 새 파일은 write_file을 사용하세요.");
    }
    let original = match fs::read_to_string(&resolved.path) {
        Ok(text) => text,
        Err(error) => return ToolOutput::fail(format!("파일을 읽지 못했습니다: {error}")),
    };
    let updated = if let Some(diff) = args.get("diff").and_then(Value::as_str) {
        match apply_unified_diff(&original, diff) {
            Ok(text) => text,
            Err(error) => {
                return ToolOutput::fail(format!(
                    "패치를 적용하지 못했습니다: {}. old_string/new_string으로 다시 시도하세요.",
                    edit_message(&error)
                ))
            }
        }
    } else {
        let Some(old) = args.get("old_string").and_then(Value::as_str) else {
            return ToolOutput::fail("old_string 또는 diff가 필요합니다.");
        };
        let Some(new) = args.get("new_string").and_then(Value::as_str) else {
            return ToolOutput::fail("new_string이 필요합니다.");
        };
        let replace_all = args.get("replace_all").and_then(Value::as_bool).unwrap_or(false);
        match apply_replacement(&original, old, new, replace_all) {
            Ok(text) => text,
            Err(error) => return ToolOutput::fail(edit_message(&error)),
        }
    };
    if updated == original {
        return ToolOutput::ok("변경 사항이 없습니다.");
    }
    if let Err(error) = capture(ctx, &resolved.path) {
        return error;
    }
    if let Err(error) = fs::write(&resolved.path, &updated) {
        return ToolOutput::fail(format!("파일을 쓰지 못했습니다: {error}"));
    }
    let diff = unified_diff(&original, &updated);
    let change = record_change(ctx, &resolved.path, "modified", &diff);
    let mut output = ToolOutput::ok(format!("updated {}", relative_display(&ctx.workspace, &resolved.path)));
    output.file_changes = vec![change];
    output.mutated = true;
    output
}

pub fn create_directory(args: &Value, ctx: &ToolCtx) -> ToolOutput {
    let Some(raw) = args.get("path").and_then(Value::as_str) else {
        return ToolOutput::fail("path가 필요합니다.");
    };
    let resolved = match resolve_path(&ctx.workspace, raw) {
        Ok(path) => path,
        Err(_) => return ToolOutput::fail("경로가 비어 있습니다."),
    };
    if resolved.path == ctx.workspace || is_critical_path(&resolved.path) {
        return ToolOutput::fail("이 경로는 만들 수 없습니다.");
    }
    if let Err(error) = capture(ctx, &resolved.path) {
        return error;
    }
    if let Err(error) = fs::create_dir_all(&resolved.path) {
        return ToolOutput::fail(format!("디렉터리를 만들지 못했습니다: {error}"));
    }
    let change = record_change(
        ctx,
        &resolved.path,
        "added",
        &format!("created directory {}", relative_display(&ctx.workspace, &resolved.path)),
    );
    let mut output = ToolOutput::ok(format!("created {}", relative_display(&ctx.workspace, &resolved.path)));
    output.file_changes = vec![change];
    output.mutated = true;
    output
}

pub fn move_file(args: &Value, ctx: &ToolCtx) -> ToolOutput {
    transfer(args, ctx, true)
}

pub fn copy_file(args: &Value, ctx: &ToolCtx) -> ToolOutput {
    transfer(args, ctx, false)
}

fn transfer(args: &Value, ctx: &ToolCtx, rename: bool) -> ToolOutput {
    let Some(from_raw) = args.get("from").and_then(Value::as_str) else {
        return ToolOutput::fail("from이 필요합니다.");
    };
    let Some(to_raw) = args.get("to").and_then(Value::as_str) else {
        return ToolOutput::fail("to가 필요합니다.");
    };
    let from = match resolve_path(&ctx.workspace, from_raw) {
        Ok(path) => path,
        Err(_) => return ToolOutput::fail("from 경로가 비어 있습니다."),
    };
    let to = match resolve_path(&ctx.workspace, to_raw) {
        Ok(path) => path,
        Err(_) => return ToolOutput::fail("to 경로가 비어 있습니다."),
    };
    if !from.path.exists() {
        return ToolOutput::fail("원본 경로가 없습니다.");
    }
    if to.path.exists() && !args.get("overwrite").and_then(Value::as_bool).unwrap_or(false) {
        return ToolOutput::fail("대상이 이미 있습니다. overwrite를 true로 요청해야 덮어씁니다.");
    }
    if is_critical_path(&from.path) || is_critical_path(&to.path) || from.path == ctx.workspace {
        return ToolOutput::fail("이 경로는 이동하거나 복사할 수 없습니다.");
    }
    if let Err(error) = capture(ctx, &from.path) {
        return error;
    }
    if to.path.exists() {
        if let Err(error) = capture(ctx, &to.path) {
            return error;
        }
    } else if let Err(error) = capture(ctx, &to.path) {
        return error;
    }
    if let Some(parent) = to.path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            return ToolOutput::fail(format!("대상 폴더를 만들지 못했습니다: {error}"));
        }
    }
    let result = if rename {
        fs::rename(&from.path, &to.path).or_else(|_| {
            if from.path.is_dir() {
                Err(std::io::Error::other("디렉터리 이동에 실패했습니다."))
            } else {
                fs::copy(&from.path, &to.path).and_then(|_| fs::remove_file(&from.path))
            }
        })
    } else if from.path.is_dir() {
        copy_dir(&from.path, &to.path)
    } else {
        fs::copy(&from.path, &to.path).map(|_| ())
    };
    if let Err(error) = result {
        return ToolOutput::fail(format!("파일 작업에 실패했습니다: {error}"));
    }
    let kind = if rename { "moved" } else { "added" };
    let diff = format!(
        "{} {} -> {}",
        if rename { "moved" } else { "copied" },
        relative_display(&ctx.workspace, &from.path),
        relative_display(&ctx.workspace, &to.path)
    );
    let change = record_change(ctx, &to.path, kind, &diff);
    let mut output = ToolOutput::ok(diff);
    output.file_changes = vec![change];
    output.mutated = true;
    output
}

pub fn delete_file(args: &Value, ctx: &ToolCtx) -> ToolOutput {
    let Some(raw) = args.get("path").and_then(Value::as_str) else {
        return ToolOutput::fail("path가 필요합니다.");
    };
    let resolved = match resolve_path(&ctx.workspace, raw) {
        Ok(path) => path,
        Err(_) => return ToolOutput::fail("경로가 비어 있습니다."),
    };
    if !resolved.path.exists() {
        return ToolOutput::fail("삭제할 경로가 없습니다.");
    }
    if resolved.path == ctx.workspace || is_critical_path(&resolved.path) {
        return ToolOutput::fail("작업 공간 루트와 시스템 경로는 삭제할 수 없습니다.");
    }
    if resolved.path.is_dir() {
        let recursive = args.get("recursive").and_then(Value::as_bool).unwrap_or(false);
        if !recursive {
            return ToolOutput::fail("디렉터리를 지우려면 recursive: true가 필요합니다.");
        }
        let count = WalkDir::new(&resolved.path).into_iter().filter_map(Result::ok).count();
        if count > 200 {
            return ToolOutput::fail("200개가 넘는 항목은 한 번에 삭제할 수 없습니다.");
        }
        for entry in WalkDir::new(&resolved.path).into_iter().filter_map(Result::ok) {
            if entry.path().is_file() {
                if let Err(error) = capture(ctx, entry.path()) {
                    return error;
                }
            }
        }
        if let Err(error) = capture(ctx, &resolved.path) {
            return error;
        }
        if let Err(error) = fs::remove_dir_all(&resolved.path) {
            return ToolOutput::fail(format!("디렉터리를 삭제하지 못했습니다: {error}"));
        }
    } else {
        if let Err(error) = capture(ctx, &resolved.path) {
            return error;
        }
        if let Err(error) = fs::remove_file(&resolved.path) {
            return ToolOutput::fail(format!("파일을 삭제하지 못했습니다: {error}"));
        }
    }
    let change = record_change(
        ctx,
        &resolved.path,
        "deleted",
        &format!("deleted {}", relative_display(&ctx.workspace, &resolved.path)),
    );
    let mut output = ToolOutput::ok(format!("deleted {}", relative_display(&ctx.workspace, &resolved.path)));
    output.file_changes = vec![change];
    output.mutated = true;
    output
}

pub fn search_files(args: &Value, ctx: &ToolCtx) -> ToolOutput {
    let Some(query) = args.get("query").and_then(Value::as_str) else {
        return ToolOutput::fail("query가 필요합니다.");
    };
    let root = search_root(args, ctx);
    let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(100).clamp(1, 300) as usize;
    let needle = query.to_ascii_lowercase();
    let mut matches = Vec::new();
    for entry in walk(&root) {
        if matches.len() >= limit {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if wildcard(&needle, &name) || name.contains(&needle) {
            matches.push(relative_display(&ctx.workspace, entry.path()));
        }
    }
    if matches.is_empty() {
        ToolOutput::ok("일치하는 파일이 없습니다.")
    } else {
        ToolOutput::ok(matches.join("\n"))
    }
}

pub fn search_text(args: &Value, ctx: &ToolCtx) -> ToolOutput {
    let Some(query) = args.get("query").and_then(Value::as_str) else {
        return ToolOutput::fail("query가 필요합니다.");
    };
    if query.is_empty() {
        return ToolOutput::fail("query가 비어 있습니다.");
    }
    let root = search_root(args, ctx);
    let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(80).clamp(1, 200) as usize;
    let case_sensitive = args.get("case_sensitive").and_then(Value::as_bool).unwrap_or(false);
    let mut matches = Vec::new();
    for entry in walk(&root) {
        if matches.len() >= limit || !entry.path().is_file() {
            if matches.len() >= limit {
                break;
            }
            continue;
        }
        if crate::safety::paths::is_sensitive_path(entry.path()) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else { continue };
        if metadata.len() > 1_000_000 {
            continue;
        }
        let Ok(bytes) = fs::read(entry.path()) else { continue };
        if bytes.contains(&0) {
            continue;
        }
        let text = String::from_utf8_lossy(&bytes);
        for (index, line) in text.lines().enumerate() {
            let hit = if case_sensitive {
                line.contains(query)
            } else {
                line.to_ascii_lowercase().contains(&query.to_ascii_lowercase())
            };
            if hit {
                matches.push(format!(
                    "{}:{}: {}",
                    relative_display(&ctx.workspace, entry.path()),
                    index + 1,
                    line.trim()
                ));
                if matches.len() >= limit {
                    break;
                }
            }
        }
    }
    let body = if matches.is_empty() {
        "일치하는 문자열이 없습니다.".to_string()
    } else {
        matches.join("\n")
    };
    ToolOutput::ok(truncate_observation(&body, 12_000))
}

fn search_root(args: &Value, ctx: &ToolCtx) -> PathBuf {
    args.get("path")
        .and_then(Value::as_str)
        .and_then(|raw| resolve_path(&ctx.workspace, raw).ok())
        .filter(|resolved| resolved.inside_workspace)
        .map(|resolved| resolved.path)
        .unwrap_or_else(|| ctx.workspace.clone())
}

fn walk(root: &Path) -> Vec<walkdir::DirEntry> {
    WalkDir::new(root)
        .max_depth(8)
        .into_iter()
        .filter_entry(|entry| {
            entry
                .file_name()
                .to_str()
                .map(|name| !should_skip_dir(name))
                .unwrap_or(false)
        })
        .filter_map(Result::ok)
        .take(20_000)
        .collect()
}

fn wildcard(pattern: &str, name: &str) -> bool {
    if !pattern.contains('*') && !pattern.contains('?') {
        return false;
    }
    simple_glob(pattern, name)
}

fn simple_glob(pattern: &str, text: &str) -> bool {
    fn rec(pattern: &[char], text: &[char]) -> bool {
        if pattern.is_empty() {
            return text.is_empty();
        }
        match pattern[0] {
            '*' => rec(&pattern[1..], text) || (!text.is_empty() && rec(pattern, &text[1..])),
            '?' => !text.is_empty() && rec(&pattern[1..], &text[1..]),
            other => !text.is_empty() && text[0] == other && rec(&pattern[1..], &text[1..]),
        }
    }
    rec(
        &pattern.chars().collect::<Vec<_>>(),
        &text.chars().collect::<Vec<_>>(),
    )
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn capture(ctx: &ToolCtx, path: &Path) -> Result<(), ToolOutput> {
    ctx.db
        .capture_snapshot(&ctx.task_id, path)
        .map_err(|error| ToolOutput::fail(error.to_string()))
}

fn record_change(ctx: &ToolCtx, path: &Path, kind: &str, diff: &str) -> FileChange {
    let change = FileChange {
        path: relative_display(&ctx.workspace, path),
        kind: kind.to_string(),
        diff: truncate_observation(diff, 60_000),
    };
    let _ = ctx.db.insert_file_change(&ctx.task_id, &change);
    change
}

fn edit_message(error: &EditError) -> String {
    match error {
        EditError::EmptyOld => "old_string이 비어 있습니다.".into(),
        EditError::NotFound => "old_string과 일치하는 내용이 없습니다. 파일을 다시 읽고 정확히 복사하세요.".into(),
        EditError::Ambiguous(count) => format!("old_string이 {count}번 등장합니다. 더 긴 문맥을 포함하세요."),
        EditError::Patch(message) => format!("diff 오류: {message}"),
    }
}
