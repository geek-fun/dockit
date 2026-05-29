const TOOL_OUTPUT_MAX_BYTES: usize = 32 * 1024; // 32 KB

/// Truncate tool output to a maximum byte length, preserving UTF-8 character
/// boundaries. If the output exceeds the limit, a truncation notice is appended.
pub(crate) fn truncate_tool_output(output: String) -> String {
    if output.len() <= TOOL_OUTPUT_MAX_BYTES {
        return output;
    }
    // Find the nearest char boundary at or before the byte limit to avoid splitting a UTF-8 codepoint.
    let boundary = (0..=TOOL_OUTPUT_MAX_BYTES)
        .rev()
        .find(|&i| output.is_char_boundary(i))
        .unwrap_or(0);
    let omitted = output.len() - boundary;
    format!(
        "{}\n\n[Output truncated: {} bytes omitted. Consider refining your query to return fewer results.]",
        &output[..boundary], omitted
    )
}
