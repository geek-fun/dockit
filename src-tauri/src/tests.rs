#[cfg(not(target_os = "windows"))]
#[test]
fn test_init_registry_no_panic() {
    // Attempt to initialize the registry with all app capabilities.
    // If another test already initialized it (OnceLock is set-once),
    // this call is silently ignored. In either case the registry is
    // available and contains agent-tagged capabilities.
    data_studio_agent::capabilities::registry::init_registry(&[
        crate::capabilities::es::register_all,
        crate::capabilities::mongo::register_all,
        crate::capabilities::dynamo::register_all,
        crate::capabilities::dockit::register_all,
    ]);
    let reg = data_studio_agent::capabilities::registry::registry();
    let agent_count = reg.agent_tools().len();
    assert!(agent_count > 0, "should have agent tools, got {agent_count}");
}
