import { Outlet } from 'react-router'

import { useCustomTheme, useLoadingOverlay } from './_layout/hooks'

/**
 * Common ancestor of every route: hides the boot overlay from index.html as
 * soon as the theme is ready. Must live ABOVE the auth guard because the
 * guard can land on /login where the main layout never mounts.
 */
export function AppShell() {
  const { theme } = useCustomTheme()
  useLoadingOverlay(Boolean(theme))
  return <Outlet />
}
