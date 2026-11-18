use std::env;

pub struct AwsBedrockClient {
    pub model_id: String,
}

impl AwsBedrockClient {
    pub fn new() -> Self {
        Self {
            model_id: env::var("AWS_BEDROCK_TEXT_EVAL_MODEL_ID")
                .or_else(|_| env::var("AWS_BEDROCK_MODEL_ID"))
                .unwrap_or_else(|_| "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string()),
        }
    }
}
