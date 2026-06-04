fn main() {
    tauri_build::build();

    // Embed Common Controls v6 manifest on Windows so test binaries can load
    // comctl32.dll v6 functions (GetWindowSubclass, TaskDialogIndirect, etc.).
    // Without this, cargo test fails with STATUS_ENTRYPOINT_NOT_FOUND because
    // Windows defaults to comctl32.dll v5 which doesn't export these functions.
    // Tauri's build process handles this for release builds via tauri-build,
    // but test binaries need explicit manifest embedding.
    #[cfg(target_os = "windows")]
    {
        embed_manifest::embed_manifest(
            embed_manifest::new_manifest("Dockit"),
        )
        .expect("unable to embed Windows manifest");
    }
    println!("cargo:rerun-if-changed=build.rs");
}
