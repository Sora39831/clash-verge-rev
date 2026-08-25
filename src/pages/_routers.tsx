import { createBrowserRouter, RouteObject } from 'react-router'

import { AuthGuard } from '@/components/auth/auth-guard'

import Layout from './_layout'
import { navItems } from './_navigation'
import LoginPage from './login'

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: LoginPage,
  },
  {
    path: '/',
    Component: () => (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: navItems.map(
      (item) =>
        ({
          path: item.path,
          Component: item.Component,
        }) as RouteObject,
    ),
  },
])
