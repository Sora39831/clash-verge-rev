import { invoke } from '@tauri-apps/api/core'

export interface AuthSession {
  baseUrl: string
  email: string
  subToken: string
  clashUrl: string
  importedUid?: string | null
}

/** Default CloudXP API endpoint (overridable on the login form). */
export const DEFAULT_AUTH_BASE_URL = 'https://api.qiwuagi.com'

export async function authLogin(
  baseUrl: string,
  email: string,
  password: string,
): Promise<AuthSession> {
  return invoke<AuthSession>('auth_login', {
    baseUrl,
    email,
    password,
  })
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
