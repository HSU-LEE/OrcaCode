#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EditError {
    EmptyOld,
    NotFound,
    Ambiguous(usize),
    Patch(String),
}

pub fn apply_replacement(
    original: &str,
    old: &str,
    new: &str,
    replace_all: bool,
) -> Result<String, EditError> {
    if old.is_empty() {
        return Err(EditError::EmptyOld);
    }
    let count = original.matches(old).count();
    if count == 1 || (replace_all && count > 0) {
        return Ok(if replace_all {
            original.replace(old, new)
        } else {
            original.replacen(old, new, 1)
        });
    }
    if count > 1 {
        return Err(EditError::Ambiguous(count));
    }
    let normalized_original = original.replace("\r\n", "\n");
    let normalized_old = old.replace("\r\n", "\n");
    let normalized_new = new.replace("\r\n", "\n");
    let normalized_count = normalized_original.matches(&normalized_old).count();
    if normalized_count == 1 || (replace_all && normalized_count > 0) {
        return Ok(if replace_all {
            normalized_original.replace(&normalized_old, &normalized_new)
        } else {
            normalized_original.replacen(&normalized_old, &normalized_new, 1)
        });
    }
    if normalized_count > 1 {
        return Err(EditError::Ambiguous(normalized_count));
    }
    Err(EditError::NotFound)
}

pub fn apply_unified_diff(original: &str, diff: &str) -> Result<String, EditError> {
    let patch = diffy::Patch::from_str(diff).map_err(|error| EditError::Patch(error.to_string()))?;
    diffy::apply(original, &patch).map_err(|error| EditError::Patch(error.to_string()))
}

pub fn unified_diff(old: &str, new: &str) -> String {
    diffy::create_patch(old, new).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_one_unique_span() {
        let updated = apply_replacement("alpha beta alpha", "beta", "gamma", false).expect("edit");
        assert_eq!(updated, "alpha gamma alpha");
    }

    #[test]
    fn rejects_ambiguous_span() {
        let error = apply_replacement("alpha alpha", "alpha", "beta", false).expect_err("ambiguous");
        assert_eq!(error, EditError::Ambiguous(2));
    }

    #[test]
    fn round_trips_unified_diff() {
        let original = "one\ntwo\nthree\n";
        let modified = "one\nTWO\nthree\n";
        let diff = unified_diff(original, modified);
        let updated = apply_unified_diff(original, &diff).expect("patch");
        assert_eq!(updated, modified);
    }
}
