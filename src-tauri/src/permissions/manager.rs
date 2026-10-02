use std::collections::HashSet;
use std::sync::Mutex;

use crate::domain::{RiskLevel, Settings};

#[derive(Default)]
pub struct ApprovalCache {
    allowed: Mutex<HashSet<String>>,
}

impl ApprovalCache {
    pub fn contains(&self, fingerprint: &str) -> bool {
        self.allowed
            .lock()
            .map(|set| set.contains(fingerprint))
            .unwrap_or(false)
    }

    pub fn allow(&self, fingerprint: String) {
        if let Ok(mut set) = self.allowed.lock() {
            set.insert(fingerprint);
        }
    }
}

pub fn should_prompt(
    level: RiskLevel,
    force_prompt: bool,
    settings: &Settings,
    cache: &ApprovalCache,
    fingerprint: &str,
) -> bool {
    if cache.contains(fingerprint) {
        return false;
    }
    if force_prompt {
        return true;
    }
    match level {
        RiskLevel::Safe => !settings.auto_approve_safe,
        RiskLevel::Caution => !settings.auto_approve_file_edits,
        RiskLevel::Dangerous => !settings.auto_approve_dangerous,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dangerous_always_prompts_until_session_allow() {
        let settings = Settings {
            auto_approve_safe: true,
            auto_approve_file_edits: true,
            ..Settings::default()
        };
        let cache = ApprovalCache::default();
        assert!(should_prompt(
            RiskLevel::Dangerous,
            false,
            &settings,
            &cache,
            "rm"
        ));
        cache.allow("rm".into());
        assert!(!should_prompt(
            RiskLevel::Dangerous,
            false,
            &settings,
            &cache,
            "rm"
        ));
    }

    #[test]
    fn safe_can_auto_approve_and_outside_workspace_still_prompts() {
        let settings = Settings::default();
        let cache = ApprovalCache::default();
        assert!(!should_prompt(
            RiskLevel::Safe,
            false,
            &settings,
            &cache,
            "read"
        ));
        assert!(should_prompt(
            RiskLevel::Safe,
            true,
            &settings,
            &cache,
            "outside"
        ));
    }

    #[test]
    fn full_access_can_skip_dangerous_prompts() {
        let settings = Settings {
            auto_approve_dangerous: true,
            ..Settings::default()
        };
        let cache = ApprovalCache::default();
        assert!(!should_prompt(
            RiskLevel::Dangerous,
            false,
            &settings,
            &cache,
            "gui"
        ));
    }

    #[test]
    fn file_edits_follow_the_caution_setting() {
        let mut settings = Settings {
            auto_approve_file_edits: false,
            ..Settings::default()
        };
        let cache = ApprovalCache::default();
        assert!(should_prompt(
            RiskLevel::Caution,
            false,
            &settings,
            &cache,
            "edit"
        ));
        settings.auto_approve_file_edits = true;
        assert!(!should_prompt(
            RiskLevel::Caution,
            false,
            &settings,
            &cache,
            "edit"
        ));
    }
}
