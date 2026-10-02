use std::sync::LazyLock;

use regex::Regex;

static ASSIGNMENT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?i)\b([A-Za-z0-9_.-]*(?:api[_-]?key|access[_-]?key|secret|password|passwd|token|private[_-]?key)[A-Za-z0-9_.-]*)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)"#,
    )
    .expect("assignment regex")
});

static KNOWN_TOKENS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)(sk-[A-Za-z0-9_\-]{16,}|sk-ant-[A-Za-z0-9_\-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9\-._~+/]{12,}=*)",
    )
    .expect("token regex")
});

static PEM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----")
        .expect("pem regex")
});

pub fn redact_secrets(input: &str) -> String {
    let without_pem = PEM.replace_all(input, "[REDACTED_PRIVATE_KEY]");
    let without_tokens = KNOWN_TOKENS.replace_all(&without_pem, "[REDACTED]");
    ASSIGNMENT
        .replace_all(&without_tokens, |caps: &regex::Captures| {
            let key = caps.get(1).map(|item| item.as_str()).unwrap_or("");
            let separator = caps.get(2).map(|item| item.as_str()).unwrap_or("=");
            let raw_value = caps.get(3).map(|item| item.as_str()).unwrap_or("");
            if value_looks_secret(raw_value) {
                format!("{key}{separator}[REDACTED]")
            } else {
                caps.get(0).map(|item| item.as_str()).unwrap_or("").to_string()
            }
        })
        .to_string()
}

fn value_looks_secret(raw: &str) -> bool {
    let quoted = raw.starts_with('"') || raw.starts_with('\'');
    let unquoted = raw.trim_matches(|ch| ch == '"' || ch == '\'');
    if unquoted.contains('(') || unquoted.contains(')') {
        return false;
    }
    if quoted {
        return unquoted.len() >= 8;
    }
    let tokenish = unquoted
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '+' | '='));
    tokenish && unquoted.len() >= 12
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_assignment_and_known_keys() {
        let input = "API_KEY=abcd1234efgh5678\nsk-abcdefghijklmnopqrstuvwxyz\nlet token = tokens.next();";
        let output = redact_secrets(input);
        assert!(output.contains("API_KEY=[REDACTED]"));
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("abcd1234efgh5678"));
        assert!(output.contains("let token = tokens.next();"));
    }

    #[test]
    fn redacts_private_key_block() {
        let input = "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----";
        assert_eq!(redact_secrets(input), "[REDACTED_PRIVATE_KEY]");
    }

    #[test]
    fn keeps_short_non_secret_assignment() {
        let input = r#"password = "short""#;
        assert_eq!(redact_secrets(input), input);
    }
}
