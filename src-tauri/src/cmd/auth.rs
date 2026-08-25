use super::{CmdResult, coded_error};
use crate::utils::{dirs, help};
use clash_verge_logging::{Type, logging};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Persistent CloudXP account session. Stored in the app data directory
/// (never contains the password; the subscription token is the credential).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSession {
    pub base_url: String,
    pub email: String,
    #[serde(rename = "subToken")]
    pub sub_token: String,
    #[serde(rename = "clashUrl")]
    pub clash_url: String,
    /// CVR profile uid created from `clash_url`, recorded after import.
    #[serde(rename = "importedUid", skip_serializing_if = "Option::is_none")]
    pub imported_uid: Option<String>,
}

fn auth_path() -> Result<PathBuf, anyhow::Error> {
    Ok(dirs::app_home_dir()?.join("auth.json"))
}

fn read_session() -> Result<Option<AuthSession>, anyhow::Error> {
    let path = auth_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path)?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    Ok(serde_json::from_str(trimmed).ok())
}

fn write_session(session: &AuthSession) -> Result<(), anyhow::Error> {
    let path = auth_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::write(&path, serde_json::to_vec_pretty(session)?)?;
    Ok(())
}

fn mask_token(value: &str) -> String {
    if value.len() <= 8 {
        "***".into()
    } else {
        format!("{}***{}", &value[..4], &value[value.len() - 4..])
    }
}

/// Extract the `session` cookie value from a Set-Cookie style header value.
fn extract_session_cookie(cookie_header: &str) -> Option<String> {
    for part in cookie_header.split(';') {
        let part = part.trim();
        if let Some(value) = part.strip_prefix("session=") {
            return Some(value.trim().to_owned());
        }
    }
    None
}

/// Login to the CloudXP backend and persist the session (email + sub token).
#[tauri::command]
pub async fn auth_login(
    base_url: String,
    email: String,
    password: String,
) -> CmdResult<AuthSession> {
    const CODE: &str = "AUTH_LOGIN_FAILED";
    logging!(info, Type::Cmd, "[auth] login begin: {email}");

    let base_url = base_url.trim_end_matches('/').to_owned();
    if !base_url.starts_with("https://") && !base_url.starts_with("http://") {
        return Err(coded_error(CODE, "服务器地址必须以 http(s):// 开头"));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| coded_error(CODE, format_args!("HTTP client init failed: {e}")))?;

    // Step 1: password login → session cookie
    let login_body =
        serde_json::json!({ "email": email.clone(), "password": password });
    let response = client
        .post(format!("{base_url}/api/auth/login"))
        .json(&login_body)
        .send()
        .await
        .map_err(|e| coded_error(CODE, format_args!("无法连接服务器: {e}")))?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        let detail = response.text().await.unwrap_or_default();
        let message = serde_json::from_str::<serde_json::Value>(&detail)
            .ok()
            .and_then(|v| {
                v.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str().map(str::to_owned))
            })
            .unwrap_or_else(|| "邮箱或密码错误".into());
        return Err(coded_error(CODE, message));
    }
    if !status.is_success() {
        return Err(coded_error(CODE, format_args!("登录失败（HTTP {status}）")));
    }

    let session_cookie = response
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .find_map(|value| {
            value
                .to_str()
                .ok()
                .and_then(extract_session_cookie)
        })
        .ok_or_else(|| coded_error(CODE, "服务器未返回会话凭证"))?;

    // Step 2: fetch this account's mihomo subscription URL
    let sub_response = client
        .get(format!("{base_url}/api/me/subscription"))
        .header(reqwest::header::COOKIE, format!("session={session_cookie}"))
        .send()
        .await
        .map_err(|e| coded_error(CODE, format_args!("获取订阅信息失败: {e}")))?;
    if !sub_response.status().is_success() {
        return Err(coded_error(
            CODE,
            format_args!("获取订阅信息失败（HTTP {}）", sub_response.status()),
        ));
    }
    #[derive(serde::Deserialize)]
    struct SubscriptionInfo {
        #[serde(rename = "clashUrl")]
        clash_url: String,
        #[serde(rename = "subToken")]
        sub_token: String,
    }
    let info: SubscriptionInfo = sub_response
        .json()
        .await
        .map_err(|e| coded_error(CODE, format_args!("订阅响应解析失败: {e}")))?;

    // Preserve an existing imported uid when the same account logs in again.
    let previous = read_session().ok().flatten();
    let imported_uid = previous
        .filter(|p| p.email == email && p.sub_token == info.sub_token)
        .and_then(|p| p.imported_uid);
    let session = AuthSession {
        base_url,
        email: email.clone(),
        sub_token: info.sub_token,
        clash_url: info.clash_url,
        imported_uid,
    };

    logging!(
        info,
        Type::Cmd,
        "[auth] login ok: {email}, token={}",
        help::mask_url(&session.sub_token),
    );

    write_session(&session)
        .map_err(|e| coded_error(CODE, format_args!("会话写入失败: {e}")))?;

    logging!(info, Type::Cmd, "[auth] session saved ({})", mask_token(&session.sub_token));
    Ok(session)
}

/// Return the stored session, or null when not logged in.
#[tauri::command]
pub async fn auth_get_session() -> CmdResult<Option<AuthSession>> {
    match read_session() {
        Ok(session) => Ok(session),
        Err(e) => Err(coded_error("AUTH_SESSION_READ_FAILED", e)),
    }
}

/// Record the profile uid created from the account subscription.
#[tauri::command]
pub async fn auth_save_imported_uid(uid: String) -> CmdResult {
    let mut session = read_session()
        .map_err(|e| coded_error("AUTH_SESSION_READ_FAILED", e))?
        .ok_or_else(|| coded_error("AUTH_NO_SESSION", "尚未登录"))?;
    session.imported_uid = Some(uid);
    write_session(&session).map_err(|e| coded_error("AUTH_SESSION_WRITE_FAILED", e))?;
    Ok(())
}

/// Clear the local session. The profile item itself is handled by the caller.
#[tauri::command]
pub async fn auth_logout() -> CmdResult {
    let path = auth_path().map_err(|e| coded_error("AUTH_LOGOUT_FAILED", e))?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| coded_error("AUTH_LOGOUT_FAILED", e))?;
    }
    logging!(info, Type::Cmd, "[auth] logout: local session cleared");
    Ok(())
}

/// Probe the account subscription endpoint and return its HTTP status code,
/// so the frontend can distinguish a reset token (404) from a disabled or
/// expired account (403).
#[tauri::command]
pub async fn auth_probe() -> CmdResult<u16> {
    const CODE: &str = "AUTH_PROBE_FAILED";
    let session = read_session()
        .map_err(|e| coded_error(CODE, e))?
        .ok_or_else(|| coded_error("AUTH_NO_SESSION", "尚未登录"))?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| coded_error(CODE, format_args!("HTTP client init failed: {e}")))?;
    let response = client
        .get(&session.clash_url)
        .send()
        .await
        .map_err(|e| coded_error(CODE, format_args!("网络请求失败: {e}")))?;
    Ok(response.status().as_u16())
}
