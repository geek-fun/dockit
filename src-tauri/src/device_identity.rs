//! Device identity & fingerprint (geekfun#59).
//!
//! Multi-source hardware identifiers are HMAC'd with an app-specific key
//! before leaving the device — the server treats fingerprints and component
//! hashes as opaque strings and never sees raw identifiers. Sources follow
//! the design matrix: macOS `IOPlatformUUID` (survives reinstall), Windows
//! SMBIOS UUID (survives) + `MachineGuid` (resets on reinstall), Linux
//! `machine-id` (resets) + DMI `product_uuid`. Virtual machines derive their
//! identity from the platform instance UUID + a per-install random ID so
//! clones diverge into separate slots (design Q5-b).

use std::collections::BTreeMap;
use std::path::Path;

use hmac::{Hmac, Mac};
use serde::Serialize;
use sha2::Sha256;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

/// App-specific fingerprint key (DocKit). Rotating it forks device identity
/// for every install — only change together with a coordinated release.
pub const DEVICE_HMAC_KEY: &str = "geekfun/dockit/device-identity/v1";

const INSTALL_ID_FILE: &str = "device-install-id";

pub fn hmac_hex(value: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(DEVICE_HMAC_KEY.as_bytes())
        .expect("HMAC accepts any key length");
    mac.update(value.as_bytes());
    hex_encode(&mac.finalize().into_bytes())
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

// ─── raw sources (per OS) ────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
pub fn platform_uuid() -> Option<String> {
    let output = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()?;
    parse_ioreg_value(&String::from_utf8_lossy(&output.stdout), "IOPlatformUUID")
}

#[cfg(target_os = "macos")]
pub fn hardware_serial() -> Option<String> {
    let output = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()?;
    parse_ioreg_value(
        &String::from_utf8_lossy(&output.stdout),
        "IOPlatformSerialNumber",
    )
}

#[cfg(target_os = "macos")]
fn parse_ioreg_value(text: &str, key: &str) -> Option<String> {
    let quoted = format!("\"{key}\"");
    text.lines()
        .find(|line| line.contains(&quoted))
        .and_then(|line| line.rsplit('=').next())
        .map(|value| {
            value
                .trim()
                .trim_end_matches(';')
                .trim()
                .trim_matches('"')
                .to_string()
        })
        .filter(|value| !value.is_empty())
}

#[cfg(target_os = "windows")]
pub fn platform_uuid() -> Option<String> {
    command_line("csproduct get UUID")
        .or_else(|| powershell("(Get-CimInstance Win32_ComputerSystemProduct).UUID.Value"))
}

#[cfg(target_os = "windows")]
pub fn machine_guid() -> Option<String> {
    let output = std::process::Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Cryptography",
            "/v",
            "MachineGuid",
        ])
        .output()
        .ok()?;
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find(|line| line.contains("MachineGuid"))
        .and_then(|line| line.rsplit(|c| c == ' ').find(|part| !part.is_empty()))
        .map(str::to_string)
        .filter(|value| !value.is_empty())
}

#[cfg(target_os = "windows")]
pub fn system_manufacturer() -> Option<String> {
    command_line("computersystem get Manufacturer")
        .or_else(|| powershell("(Get-CimInstance Win32_ComputerSystem).Manufacturer.Value"))
}

#[cfg(target_os = "windows")]
fn command_line(wmic_args: &str) -> Option<String> {
    let mut args = vec!["/value:off", "/header:off"];
    args.extend(wmic_args.split_whitespace());
    let output = std::process::Command::new("wmic")
        .args(args)
        .output()
        .ok()?;
    parse_value_output(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "windows")]
fn powershell(script: &str) -> Option<String> {
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .ok()?;
    parse_value_output(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "windows")]
fn parse_value_output(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

#[cfg(target_os = "linux")]
pub fn platform_uuid() -> Option<String> {
    read_trimmed("/sys/class/dmi/id/product_uuid")
        .or_else(|| read_trimmed("/etc/machine-id"))
        .or_else(|| read_trimmed("/var/lib/dbus/machine-id"))
}

#[cfg(target_os = "linux")]
pub fn machine_id() -> Option<String> {
    read_trimmed("/etc/machine-id").or_else(|| read_trimmed("/var/lib/dbus/machine-id"))
}

#[cfg(target_os = "linux")]
pub fn system_vendor() -> Option<String> {
    read_trimmed("/sys/class/dmi/id/sys_vendor")
}

#[cfg(target_os = "linux")]
fn read_trimmed(path: &str) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|raw| raw.trim().to_string())
        .filter(|raw| !raw.is_empty())
}

fn hostname() -> String {
    let detected = detect_hostname();
    detected.unwrap_or_else(|| "Unknown".to_string())
}

#[cfg(target_os = "macos")]
fn detect_hostname() -> Option<String> {
    std::process::Command::new("sysctl")
        .args(["-n", "kern.hostname"])
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|name| !name.is_empty())
}

#[cfg(target_os = "linux")]
fn detect_hostname() -> Option<String> {
    read_trimmed("/proc/sys/kernel/hostname").or_else(|| {
        std::process::Command::new("hostname")
            .output()
            .ok()
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .filter(|name| !name.is_empty())
    })
}

#[cfg(target_os = "windows")]
fn detect_hostname() -> Option<String> {
    std::env::var("COMPUTERNAME")
        .ok()
        .filter(|name| !name.is_empty())
}

pub const CURRENT_PLATFORM: &str = if cfg!(target_os = "macos") {
    "macos"
} else if cfg!(target_os = "windows") {
    "windows"
} else {
    "linux"
};

#[cfg(target_os = "macos")]
fn detect_virtual() -> bool {
    std::process::Command::new("sysctl")
        .args(["-n", "hw.model"])
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).to_lowercase())
        .map(|model| {
            ["virtualmac", "vmware", "parallels", "kvm", "qemu"]
                .iter()
                .any(|marker| model.contains(marker))
        })
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn detect_virtual() -> bool {
    detect_virtual_from(system_vendor())
}

#[cfg(target_os = "windows")]
fn detect_virtual() -> bool {
    detect_virtual_from(system_manufacturer())
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
fn detect_virtual_from(vendor: Option<String>) -> bool {
    vendor
        .map(|vendor| vendor.to_lowercase())
        .map(|vendor| {
            [
                "qemu",
                "kvm",
                "vmware",
                "virtualbox",
                "xen",
                "microsoft",
                "parallels",
            ]
            .iter()
            .any(|marker| vendor.contains(marker))
        })
        .unwrap_or(false)
}

// ─── identity composition ────────────────────────────────────────────────────

/// Install-scoped random ID: makes clones that preserve every hardware
/// identifier (full VM clones) diverge into separate device slots.
pub fn load_or_create_install_id(app_data_dir: &Path) -> String {
    let path = app_data_dir.join(INSTALL_ID_FILE);
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let trimmed = existing.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    let fresh = Uuid::new_v4().to_string();
    if let Err(err) = std::fs::write(&path, &fresh) {
        log::warn!("failed to persist device install id: {err}");
    }
    fresh
}

pub struct RawIdentity {
    /// Most stable identifier for this machine (survives reinstall).
    pub primary: Option<String>,
    /// Weaker sources — used as primary fallback and as fuzzy-match drift.
    pub secondary: Vec<(String, String)>,
    pub is_virtual: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePayload {
    pub fingerprint: String,
    pub components: BTreeMap<String, String>,
    pub name: String,
    pub platform: String,
    pub is_virtual: bool,
}

/// Pure composition (unit-testable): primary survives reinstall; VMs mix in
/// the install id so clones diverge; missing sources never cause a failure —
/// the install id alone still yields a stable identity (design F5).
pub fn compose_payload(
    identity: &RawIdentity,
    install_id: &str,
    name: &str,
    platform: &str,
) -> DevicePayload {
    let mut components: BTreeMap<String, String> = identity
        .secondary
        .iter()
        .map(|(source, value)| (source.clone(), hmac_hex(value)))
        .collect();
    components.insert("install".to_string(), hmac_hex(install_id));

    let primary = match identity.primary.as_deref() {
        Some(primary) if identity.is_virtual => format!("vm|{primary}|{install_id}"),
        Some(primary) => primary.to_string(),
        None => format!("fallback|{install_id}"),
    };

    DevicePayload {
        fingerprint: hmac_hex(&primary),
        components,
        // Console-replaceable label; hostnames are already short but stay safe.
        name: name.chars().take(100).collect(),
        platform: platform.to_string(),
        is_virtual: identity.is_virtual,
    }
}

pub fn build_payload(app_data_dir: &Path) -> DevicePayload {
    let install_id = load_or_create_install_id(app_data_dir);
    let identity = collect_identity();
    compose_payload(&identity, &install_id, &hostname(), CURRENT_PLATFORM)
}

#[cfg(target_os = "macos")]
fn collect_identity() -> RawIdentity {
    let mut secondary: Vec<(String, String)> = Vec::new();
    if let Some(serial) = hardware_serial() {
        secondary.push(("serial".to_string(), serial));
    }
    RawIdentity {
        primary: platform_uuid(),
        secondary,
        is_virtual: detect_virtual(),
    }
}

#[cfg(target_os = "windows")]
fn collect_identity() -> RawIdentity {
    let mut secondary: Vec<(String, String)> = Vec::new();
    if let Some(guid) = machine_guid() {
        secondary.push(("machineGuid".to_string(), guid));
    }
    RawIdentity {
        primary: platform_uuid(),
        secondary,
        is_virtual: detect_virtual(),
    }
}

#[cfg(target_os = "linux")]
fn collect_identity() -> RawIdentity {
    let machine_id = machine_id();
    let mut secondary: Vec<(String, String)> = Vec::new();
    if let Some(id) = machine_id.as_ref() {
        secondary.push(("machineId".to_string(), id.clone()));
    }
    // product_uuid is root-readable only on many distros — machine-id is the
    // primary when DMI is unavailable.
    let primary = read_trimmed("/sys/class/dmi/id/product_uuid").or(machine_id);
    RawIdentity {
        primary,
        secondary,
        is_virtual: detect_virtual(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hmac_is_deterministic_hex() {
        let first = hmac_hex("stable-identifier");
        let second = hmac_hex("stable-identifier");
        assert_eq!(first, second);
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(hmac_hex("a"), hmac_hex("b"));
    }

    #[test]
    fn components_are_hashed_and_install_always_present() {
        let identity = RawIdentity {
            primary: Some("PLATFORM-UUID".to_string()),
            secondary: vec![("serial".to_string(), "C02X1234".to_string())],
            is_virtual: false,
        };
        let payload = compose_payload(&identity, "install-id-1", "MacBook Pro", "macos");

        assert_eq!(payload.components.len(), 2);
        assert_eq!(
            payload.components.get("serial"),
            Some(&hmac_hex("C02X1234"))
        );
        assert_eq!(
            payload.components.get("install"),
            Some(&hmac_hex("install-id-1"))
        );
        // The fingerprint never exposes the raw identifier.
        assert_eq!(payload.fingerprint, hmac_hex("PLATFORM-UUID"));
        assert!(!payload.fingerprint.contains("PLATFORM-UUID"));
    }

    #[test]
    fn virtual_machines_diverge_from_the_host_and_from_clones() {
        let host = RawIdentity {
            primary: Some("PLATFORM-UUID".to_string()),
            secondary: vec![],
            is_virtual: false,
        };
        let vm = RawIdentity {
            primary: Some("PLATFORM-UUID".to_string()),
            secondary: vec![],
            is_virtual: true,
        };

        let host_payload = compose_payload(&host, "install-1", "MacBook Pro", "macos");
        let vm_payload = compose_payload(&vm, "install-1", "VM", "macos");
        let vm_clone = compose_payload(&vm, "install-2", "VM", "macos");

        assert_ne!(host_payload.fingerprint, vm_payload.fingerprint);
        // A full clone that preserves the platform UUID still diverges via the
        // install-scoped random id.
        assert_ne!(vm_payload.fingerprint, vm_clone.fingerprint);
        assert!(vm_payload.is_virtual);
    }

    #[test]
    fn missing_sources_still_yield_a_stable_identity() {
        let bare = RawIdentity {
            primary: None,
            secondary: vec![],
            is_virtual: false,
        };
        let payload = compose_payload(&bare, "install-only", "Linux box", "linux");

        assert_eq!(payload.fingerprint, hmac_hex("fallback|install-only"));
        assert_eq!(payload.components.len(), 1);
        assert_eq!(payload.name, "Linux box");
    }
}
