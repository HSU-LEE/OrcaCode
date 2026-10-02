use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoopSignal {
    Ok,
    RepeatWarning,
    Stop,
}

#[derive(Debug, Default)]
pub struct LoopDetector {
    recent: VecDeque<(String, String)>,
}

impl LoopDetector {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn observe(&mut self, key: &str, result_signature: &str) -> LoopSignal {
        self.recent
            .push_back((key.to_string(), result_signature.to_string()));
        while self.recent.len() > 30 {
            self.recent.pop_front();
        }
        let mut consecutive = 0;
        for (seen_key, seen_result) in self.recent.iter().rev() {
            if seen_key == key && seen_result == result_signature {
                consecutive += 1;
            } else {
                break;
            }
        }
        if consecutive >= 4 {
            LoopSignal::Stop
        } else if consecutive >= 3 {
            LoopSignal::RepeatWarning
        } else {
            LoopSignal::Ok
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn warns_on_third_identical_result_and_stops_on_fourth() {
        let mut detector = LoopDetector::new();
        assert_eq!(detector.observe("cmd", "same"), LoopSignal::Ok);
        assert_eq!(detector.observe("cmd", "same"), LoopSignal::Ok);
        assert_eq!(detector.observe("cmd", "same"), LoopSignal::RepeatWarning);
        assert_eq!(detector.observe("cmd", "same"), LoopSignal::Stop);
    }

    #[test]
    fn different_results_do_not_trip() {
        let mut detector = LoopDetector::new();
        assert_eq!(detector.observe("read:a", "1"), LoopSignal::Ok);
        assert_eq!(detector.observe("read:a", "2"), LoopSignal::Ok);
        assert_eq!(detector.observe("read:b", "1"), LoopSignal::Ok);
    }
}
