// Re-export from provider_adapter for backward compatibility.
// loop_runner.rs and compact.rs import from this module, so we keep the same
// public signatures here.
pub use crate::agent::provider_adapter::{build_headers, get_base_url};
