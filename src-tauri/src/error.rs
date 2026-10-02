use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Ollama에 연결할 수 없습니다. Ollama가 실행 중인지 확인해주세요.")]
    OllamaConnection,
    #[error("모델을 불러오지 못했습니다. 설치된 모델인지 확인해주세요. {0}")]
    Model(String),
    #[error("작업이 취소되었습니다.")]
    Cancelled,
    #[error("{0}")]
    Message(String),
}

impl AppError {
    pub fn message(text: impl Into<String>) -> Self {
        Self::Message(text.into())
    }
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

impl From<rusqlite::Error> for AppError {
    fn from(value: rusqlite::Error) -> Self {
        crate::logging::log_line("error", &format!("database: {value}"));
        Self::message("로컬 데이터베이스를 읽거나 쓰지 못했습니다.")
    }
}
