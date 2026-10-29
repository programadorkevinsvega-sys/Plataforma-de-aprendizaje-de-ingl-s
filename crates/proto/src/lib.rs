#[expect(
    clippy::result_large_err,
    reason = "Generated tonic RPC methods must return tonic::Status; scope the lint expectation to generated auth bindings",
)]
pub mod auth {
    tonic::include_proto!("auth");
}

#[expect(
    clippy::result_large_err,
    reason = "Generated tonic RPC methods must return tonic::Status; scope the lint expectation to generated content bindings",
)]
pub mod content {
    tonic::include_proto!("content");
}

#[expect(
    clippy::result_large_err,
    reason = "Generated tonic RPC methods must return tonic::Status; scope the lint expectation to generated ai_evaluator bindings",
)]
pub mod ai_evaluator {
    tonic::include_proto!("ai_evaluator");
}

#[expect(
    clippy::result_large_err,
    reason = "Generated tonic RPC methods must return tonic::Status; scope the lint expectation to generated srs bindings",
)]
pub mod srs {
    tonic::include_proto!("srs");
}

#[expect(
    clippy::result_large_err,
    reason = "Generated tonic RPC methods must return tonic::Status; scope the lint expectation to generated gamification bindings",
)]
pub mod gamification {
    tonic::include_proto!("gamification");
}

#[expect(
    clippy::result_large_err,
    reason = "Generated tonic RPC methods must return tonic::Status; scope the lint expectation to generated phonetic_audio bindings",
)]
pub mod phonetic_audio {
    tonic::include_proto!("phonetic_audio");
}
