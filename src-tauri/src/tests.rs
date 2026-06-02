#[cfg(not(target_os = "windows"))]
#[test]
fn test_init_registry_no_panic() {
    crate::capabilities::registry::init_registry();
    let reg = crate::capabilities::registry::registry();
    assert!(reg.get("es__search").is_some());
    assert!(reg.get("dockit__list_connections").is_some());
    assert_eq!(reg.iter().count(), 67);
}
