import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  SvgIcon,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import iconDark from '@/assets/image/icon_dark.svg?react'
import iconLight from '@/assets/image/icon_light.svg?react'
import { DEFAULT_AUTH_BASE_URL, authLogin } from '@/services/auth'
import { getProfiles, importProfile } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { useThemeMode } from '@/services/states'

function errorDetail(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'detail' in error) {
    return String((error as { detail?: unknown }).detail)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

const LoginPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const mode = useThemeMode()
  const isDark = mode !== 'light'

  const [baseUrl, setBaseUrl] = useState(DEFAULT_AUTH_BASE_URL)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return

    setError(null)
    if (!email.trim() || !password) {
      setError(t('auth.login.errors.missingFields'))
      return
    }

    setSubmitting(true)
    try {
      const session = await authLogin(baseUrl.trim(), email.trim(), password)

      // Import the account subscription right away (idempotent).
      try {
        const profiles = await getProfiles()
        const exists = profiles?.items?.some(
          (item) => item.url === session.clashUrl,
        )
        if (!exists && !session.importedUid) {
          await importProfile(session.clashUrl)
        }
        showNotice.success(t('auth.login.feedback.importSuccess'))
      } catch (importError) {
        console.warn('[login] subscription import failed:', importError)
        showNotice.error(t('auth.login.feedback.importFailed'), importError)
      }

      navigate('/', { replace: true })
    } catch (loginError) {
      setError(errorDetail(loginError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box
      sx={(theme) => ({
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: theme.palette.background.paper,
      })}
    >
      <Card elevation={6} sx={{ width: 360, borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={0.5} sx={{ mb: 3, alignItems: 'center' }}>
            <SvgIcon
              component={isDark ? iconDark : iconLight}
              inheritViewBox
              sx={{ fontSize: 44, mb: 1 }}
            />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Clash Verge Rev(CloudXP)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('auth.login.subtitle')}
            </Typography>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Stack
            component="form"
            spacing={2}
            onSubmit={handleSubmit}
            autoComplete="on"
          >
            <TextField
              label={t('auth.login.fields.server')}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              size="small"
              fullWidth
              spellCheck={false}
            />
            <TextField
              label={t('auth.login.fields.email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              size="small"
              fullWidth
              autoComplete="username"
              disabled={submitting}
            />
            <TextField
              label={t('auth.login.fields.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              size="small"
              fullWidth
              autoComplete="current-password"
              disabled={submitting}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting}
              startIcon={
                submitting ? <CircularProgress size={18} color="inherit" /> : null
              }
            >
              {submitting ? t('auth.login.actions.submitting') : t('auth.login.actions.submit')}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}

export default LoginPage
