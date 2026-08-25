import { Box, CircularProgress } from '@mui/material'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router'

import {
  authGetSession,
  authLogout,
  authProbe,
  authSaveImportedUid,
  type AuthSession,
} from '@/services/auth'
import {
  getProfiles,
  importProfile,
  patchProfilesConfig,
  updateProfile,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

/**
 * Route guard: without a stored CloudXP session every route redirects to
 * /login. Once a session exists, the account subscription is ensured and
 * refreshed once per app start (fire-and-forget) so profiles stay current.
 *
 * Failure branches (design §4.4):
 * - probe 404 → the sub token was reset on the panel → clear session, re-login
 * - probe 403 → account pending/disabled/expired → notify with reason
 * - network unreachable → stay in the app, notice only (offline-first)
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const location = useLocation()
  const [session, setSession] = useState<AuthSession | null | undefined>(
    undefined,
  )

  useEffect(() => {
    let disposed = false
    authGetSession()
      .then((value) => {
        if (!disposed) setSession(value)
      })
      .catch((error) => {
        console.error('[auth] session check failed:', error)
        if (!disposed) setSession(null)
      })
    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (!session) return

    const ensureSubscription = async () => {
      const profiles = await getProfiles()
      const items = profiles?.items ?? []
      const existing = items.find(
        (item) =>
          item.url === session.clashUrl ||
          (!!session.importedUid && item.uid === session.importedUid),
      )

      let uid = existing?.uid ?? session.importedUid ?? undefined
      if (!existing && !uid) {
        // First login on this machine: import the account subscription.
        await importProfile(session.clashUrl)
        const refreshed = await getProfiles()
        uid = refreshed?.items?.find((item) => item.url === session.clashUrl)
          ?.uid
        if (uid) await authSaveImportedUid(uid)
      } else if (existing?.uid && existing.uid !== session.importedUid) {
        await authSaveImportedUid(existing.uid)
      }

      if (uid && !profiles?.current) {
        // Nothing active yet: make the account subscription current.
        await patchProfilesConfig({
          ...profiles,
          current: uid,
        })
      }

      if (uid) {
        try {
          await updateProfile(uid)
        } catch (updateError) {
          console.warn(
            '[auth] startup subscription update failed:',
            updateError,
          )
          // Distinguish credential loss from transient failures.
          try {
            const status = await authProbe()
            if (status === 404) {
              // Token was reset on the panel: force re-login.
              await authLogout()
              showNotice.error(t('auth.login.feedback.tokenReset'))
              setSession(null)
              return
            }
            if (status === 403) {
              showNotice.error(t('auth.login.feedback.subscriptionRejected'))
              return
            }
          } catch (probeError) {
            console.warn('[auth] probe failed (offline?):', probeError)
          }
        }
      }
    }

    void ensureSubscription().catch((error) => {
      console.warn('[auth] ensure subscription failed:', error)
    })
  }, [session, t])

  if (session === undefined) {
    return (
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress size={36} />
      </Box>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
