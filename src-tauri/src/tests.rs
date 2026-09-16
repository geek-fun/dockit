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
    assert!(
        agent_count > 0,
        "should have agent tools, got {agent_count}"
    );
}

#[test]
fn parse_auth_accepts_the_documented_deep_link() {
    let payload = crate::parse_auth_from_url(
        "dockit://auth?token=t-1&userId=u-9&username=ada&email=ada%40example.com",
    )
    .expect("valid auth link");
    assert_eq!(payload.token, "t-1");
    assert_eq!(payload.user_id.as_deref(), Some("u-9"));
    assert_eq!(payload.username.as_deref(), Some("ada"));
    assert_eq!(payload.email.as_deref(), Some("ada@example.com"));
    assert_eq!(payload.avatar, None);
}

#[test]
fn parse_auth_rejects_wrong_scheme_host_or_missing_token() {
    assert!(crate::parse_auth_from_url("https://auth?token=t-1").is_none());
    assert!(crate::parse_auth_from_url("dockit://billing?token=t-1").is_none());
    assert!(crate::parse_auth_from_url("dockit://auth?username=ada").is_none());
    assert!(crate::parse_auth_from_url("not a url").is_none());
}

#[test]
fn pending_auth_is_single_shot_and_last_write_wins() {
    let state = crate::PendingAuthState::default();
    assert!(state.consume().is_none(), "empty state consumes to none");

    state.store(crate::AuthPayload {
        token: "t-1".to_string(),
        user_id: None,
        username: Some("ada".to_string()),
        email: None,
        avatar: None,
    });
    let delivered = state.consume().expect("pending auth");
    assert_eq!(delivered.token, "t-1");
    // take-and-clear: a delivered link can never be replayed
    assert!(state.consume().is_none());

    // two links before the frontend pulls — the newest wins
    state.store(crate::AuthPayload {
        token: "t-1".to_string(),
        user_id: None,
        username: None,
        email: None,
        avatar: None,
    });
    state.store(crate::AuthPayload {
        token: "t-2".to_string(),
        user_id: None,
        username: None,
        email: None,
        avatar: None,
    });
    assert_eq!(state.consume().expect("pending auth").token, "t-2");
    assert!(state.consume().is_none());
}
