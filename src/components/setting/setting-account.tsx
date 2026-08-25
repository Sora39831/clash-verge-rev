import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { authGetSession, authLogout, type AuthSession } from '@/services/auth'
import { deleteProfile } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

import { SettingItem, SettingList } from './mods/setting-comp'

/**
 * CloudXP account card in the settings page: shows the logged-in email and
 * a two-step logout. Logout deletes the local account subscription
 * (Q3: confirmed behaviour) and returns to /login.
 */
const SettingAccount = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [session, setSession] = useState<AuthSession | null>(null)
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    let disposed = false
    authGetSession()
      .then((value) => {
        if (!disposed) setSession(value)
      })
      .catch(() => {
        if (!disposed) setSession(null)
      })
    return () => {
      disposed = true
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const onLogout = async () => {
    if (!confirming) {
      setConfirming(true)
      timerRef.current = window.setTimeout(() => setConfirming(false), 3000)
      return
    }
    setConfirming(false)
    if (timerRef.current) window.clearTimeout(timerRef.current)

    try {
      if (session?.importedUid) {
        try {
          await deleteProfile(session.importedUid)
        } catch {
          // Profile already removed manually; ignore per design §4.5.
        }
      }
      await authLogout()
      showNotice.success(t('auth.login.feedback.logoutSuccess'))
      navigate('/login', { replace: true })
    } catch (error) {
      showNotice.error(error)
    }
  }

  return (
    <SettingList title={t('auth.account.title')}>
      <SettingItem label={t('auth.account.email')} secondary={session?.email ?? '-'} />
      <SettingItem
        label={
          confirming ? t('auth.account.confirmLogout') : t('auth.account.logout')
        }
        onClick={onLogout}
      />
    </SettingList>
  )
}

export default SettingAccount
