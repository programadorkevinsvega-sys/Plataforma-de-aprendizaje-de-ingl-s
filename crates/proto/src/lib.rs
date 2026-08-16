pub mod auth {
    tonic::include_proto!("auth");
}

pub mod content {
    tonic::include_proto!("content");
}

pub mod ai_evaluator {
    tonic::include_proto!("ai_evaluator");
}

pub mod srs {
    tonic::include_proto!("srs");
}

pub mod gamification {
    tonic::include_proto!("gamification");
}

pub mod phonetic_audio {
    tonic::include_proto!("phonetic_audio");
}
