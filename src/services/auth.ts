import { invoke } from '@tauri-apps/api/core'

export interface AuthSession {
  baseUrl: string
  email: string
  subToken: string
  clashUrl: string
  importedUid?: string | null
}

/** CloudXP API endpoint, fixed at build time (mirrors the Rust constant). */
export const AUTH_BASE_URL = 'https://api.qiwuagi.com'

export async function authLogin(
  email: string,
  password: string,
): Promise<AuthSession> {
  return invoke<AuthSession>('auth_login', { email, password })
}

export async function authGetSession(): Promise<AuthSession | null> {
  return invoke<AuthSession | null>('auth_get_session')
}

export async function authSaveImportedUid(uid: string): Promise<void> {
  return invoke<void>('auth_save_imported_uid', { uid })
}

export async function authLogout(): Promise<void> {
  return invoke<void>('auth_logout')
}

/** HTTP status of the account subscription endpoint (404=token reset, 403=rejected). */
export async function authProbe(): Promise<number> {
  return invoke<number>('auth_probe')
}
