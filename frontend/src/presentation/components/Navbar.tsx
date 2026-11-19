'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getContainer } from '@/infrastructure/di/container'
import type { User } from '@/domain/entities/User'

interface LiveStats { xp: number; streakDays: number; techCoins: number }

const navItems = [
  { label: 'Inicio', href: '/dashboard' },
  { label: 'Cursos', href: '/courses' },
  { label: 'Práctica', href: '/learn' },
  { label: 'Reading / Listening', href: '/comprehension' },
  { label: 'Repaso', href: '/srs' },
  { label: 'Evaluaciones', href: '/evaluations' },
  { label: 'Tutor IA', href: '/tutor' },
  { label: 'Plan', href: '/plan' },
  { label: 'Logros', href: '/achievements' },
  { label: 'Cuenta', href: '/settings' },
]

export const Navbar: React.FC = () => {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [stats, setStats] = useState<LiveStats>({ xp: 0, streakDays: 0, techCoins: 0 })
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    const container = getContainer()
    const load = async () => {
      try {
        const [currentUser, summary] = await Promise.all([
          container.useCases.getCurrentUser.execute(),
          container.useCases.getDashboardSummary.execute(),
        ])
        if (cancelled) return
        setUser(currentUser)
        setStats({ xp: summary.xp, streakDays: summary.streakDays, techCoins: summary.techCoins })
      } catch {
        // Keep navigation available while the summary is unavailable.
      }
    }
    void load()
    const refresh = () => {
      void container.useCases.getDashboardSummary.execute().then((summary) => {
        if (!cancelled) setStats({ xp: summary.xp, streakDays: summary.streakDays, techCoins: summary.techCoins })
      }).catch(() => undefined)
    }
    window.addEventListener('devfluency:xp-updated', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('devfluency:xp-updated', refresh)
    }
  }, [])

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await getContainer().useCases.logout.execute()
      router.push('/login')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <header className="fl-navbar">
      <div className="fl-navbar-inner">
        <Link href="/dashboard" className="fl-brand" aria-label="Fluenta, inicio">
          <span className="fl-brand-mark">F</span>
          <span className="fl-brand-name">Fluenta</span>
        </Link>
        <nav className="fl-nav-links" aria-label="Navegación principal">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={'fl-nav-link ' + (active ? 'is-active' : '')}>
                {item.label}
              </Link>
            )
          })}
        </nav>
        {user && (
          <div className="fl-user-tools">
            <span className="fl-chip fl-chip-streak">🔥 Racha {stats.streakDays} días</span>
            <span className="fl-chip fl-chip-xp">⚡ {stats.xp.toLocaleString('es-CO')} XP</span>
            <span className="fl-chip fl-chip-coins">● {stats.techCoins} monedas</span>
            <span className="fl-user-name" title={user.email}>{user.firstName}</span>
            <button className="fl-logout" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? 'Saliendo…' : 'Salir'}</button>
          </div>
        )}
      </div>
    </header>
  )
}
