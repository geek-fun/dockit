use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TokenizerFamily {
    OpenAiCl100k,
    OpenAiO200k,
    Anthropic,
    DeepSeek,
    #[default]
    Generic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelSpec {
    pub model_id: String,
    pub context_window: usize,
    pub output_reserve: usize,
    #[serde(skip)]
    pub tokenizer: TokenizerFamily,
}

const DEFAULT_OPENAI_RESERVE: usize = 16_000;
const DEFAULT_ANTHROPIC_RESERVE: usize = 20_000;
const DEFAULT_DEEPSEEK_RESERVE: usize = 8_000;
const DEFAULT_OLLAMA_WINDOW: usize = 8_192;
const DEFAULT_GENERIC_WINDOW: usize = 32_768;
const DEFAULT_GENERIC_RESERVE: usize = 4_096;

const OPENAI_MODELS: &[(&str, usize, usize, TokenizerFamily)] = &[
    ("gpt-4o", 128_000, DEFAULT_OPENAI_RESERVE, TokenizerFamily::OpenAiO200k),
    ("gpt-4o-mini", 128_000, DEFAULT_OPENAI_RESERVE, TokenizerFamily::OpenAiO200k),
    ("gpt-4.1", 1_047_576, 32_000, TokenizerFamily::OpenAiO200k),
    ("gpt-4.1-mini", 1_047_576, 32_000, TokenizerFamily::OpenAiO200k),
    ("gpt-4.1-nano", 1_047_576, 32_000, TokenizerFamily::OpenAiO200k),
    ("gpt-4-turbo", 128_000, DEFAULT_OPENAI_RESERVE, TokenizerFamily::OpenAiCl100k),
    ("gpt-4", 8_192, 4_096, TokenizerFamily::OpenAiCl100k),
    ("gpt-3.5-turbo", 16_385, 4_096, TokenizerFamily::OpenAiCl100k),
    ("o1", 200_000, 32_000, TokenizerFamily::OpenAiO200k),
    ("o1-mini", 128_000, DEFAULT_OPENAI_RESERVE, TokenizerFamily::OpenAiO200k),
    ("o3", 200_000, 32_000, TokenizerFamily::OpenAiO200k),
    ("o3-mini", 200_000, 32_000, TokenizerFamily::OpenAiO200k),
];

const ANTHROPIC_MODELS: &[(&str, usize, usize)] = &[
    ("claude-sonnet-4-5", 200_000, DEFAULT_ANTHROPIC_RESERVE),
    ("claude-sonnet-4", 200_000, DEFAULT_ANTHROPIC_RESERVE),
    ("claude-opus-4", 200_000, DEFAULT_ANTHROPIC_RESERVE),
    ("claude-3-5-sonnet", 200_000, DEFAULT_ANTHROPIC_RESERVE),
    ("claude-3-5-haiku", 200_000, DEFAULT_ANTHROPIC_RESERVE),
    ("claude-3-opus", 200_000, DEFAULT_ANTHROPIC_RESERVE),
];

const DEEPSEEK_MODELS: &[(&str, usize, usize)] = &[
    ("deepseek-chat", 128_000, DEFAULT_DEEPSEEK_RESERVE),
    ("deepseek-reasoner", 128_000, DEFAULT_DEEPSEEK_RESERVE),
    ("deepseek-coder", 128_000, DEFAULT_DEEPSEEK_RESERVE),
];

fn matches_prefix(id: &str, prefix: &str) -> bool {
    id == prefix || id.starts_with(prefix)
}

pub fn resolve_spec(provider: &str, model_id: &str) -> ModelSpec {
    let lower = model_id.to_lowercase();
    if provider == "DEEP_SEEK" || lower.starts_with("deepseek") {
        for (id, ctx, reserve) in DEEPSEEK_MODELS {
            if matches_prefix(&lower, id) {
                return ModelSpec {
                    model_id: model_id.to_string(),
                    context_window: *ctx,
                    output_reserve: *reserve,
                    tokenizer: TokenizerFamily::DeepSeek,
                };
            }
        }
        return ModelSpec {
            model_id: model_id.to_string(),
            context_window: 128_000,
            output_reserve: DEFAULT_DEEPSEEK_RESERVE,
            tokenizer: TokenizerFamily::DeepSeek,
        };
    }

    if lower.starts_with("claude") {
        for (id, ctx, reserve) in ANTHROPIC_MODELS {
            if matches_prefix(&lower, id) {
                return ModelSpec {
                    model_id: model_id.to_string(),
                    context_window: *ctx,
                    output_reserve: *reserve,
                    tokenizer: TokenizerFamily::Anthropic,
                };
            }
        }
        return ModelSpec {
            model_id: model_id.to_string(),
            context_window: 200_000,
            output_reserve: DEFAULT_ANTHROPIC_RESERVE,
            tokenizer: TokenizerFamily::Anthropic,
        };
    }

    if provider == "OLLAMA" || provider == "LM_STUDIO" {
        return ModelSpec {
            model_id: model_id.to_string(),
            context_window: DEFAULT_OLLAMA_WINDOW,
            output_reserve: 2_048,
            tokenizer: TokenizerFamily::Generic,
        };
    }

    // OpenAI family (default) + OpenRouter passthroughs that match OpenAI ids.
    for (id, ctx, reserve, tk) in OPENAI_MODELS {
        if matches_prefix(&lower, id) {
            return ModelSpec {
                model_id: model_id.to_string(),
                context_window: *ctx,
                output_reserve: *reserve,
                tokenizer: *tk,
            };
        }
    }

    ModelSpec {
        model_id: model_id.to_string(),
        context_window: DEFAULT_GENERIC_WINDOW,
        output_reserve: DEFAULT_GENERIC_RESERVE,
        tokenizer: TokenizerFamily::Generic,
    }
}

/// Apply user override to context_window if provided (e.g. Ollama num_ctx).
pub fn apply_overrides(spec: ModelSpec, context_window_override: Option<usize>) -> ModelSpec {
    match context_window_override {
        Some(w) if w >= 1_024 => ModelSpec {
            context_window: w,
            ..spec
        },
        _ => spec,
    }
}

/// Usable budget excluding the per-turn output reserve.
pub fn usable_window(spec: &ModelSpec) -> usize {
    spec.context_window.saturating_sub(spec.output_reserve)
}
