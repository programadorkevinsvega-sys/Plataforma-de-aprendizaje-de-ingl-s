'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export const Sidebar: React.FC = () => {
  const pathname = usePathname()

  const mainItems = [
    { label: 'Panel Principal', icon: '📊', path: '/dashboard' },
    { label: 'Lecciones Fonéticas', icon: '📚', path: '/learn' },
    { label: 'Entrevista IA (6 Métricas)', icon: '🤖', path: '/interview' },
    { label: 'Repetición Anki SM-2', icon: '🧠', path: '/srs' },
  ]

  const progressItems = [
    { label: 'Leaderboard', icon: '🏆', path: '/leaderboard' },
    { label: 'Logros & Badges', icon: '⭐', path: '/achievements' },
  ]

  const accountItems = [
    { label: 'Mi Perfil', icon: '👤', path: '/profile' },
    { label: 'Configuración', icon: '⚙️', path: '/settings' },
  ]

  const NavLink = ({ item }: { item: { label: string; icon: string; path: string } }) => {
    const isActive = pathname === item.path || pathname.startsWith(item.path + '/')
    return (
      <Link
        href={item.path}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
          isActive
            ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
            : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
        }`}
      >
        <span className="text-base">{item.icon}</span>
        <span>{item.label}</span>
        {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400" />}
      </Link>
    )
  }

  return (
    <aside className="w-64 bg-slate-950/60 border-r border-white/10 p-4 flex flex-col justify-between hidden md:flex min-h-[calc(100vh-65px)]">
      <div className="space-y-4">
        {/* Módulos principales */}
        <div>
          <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Módulos de Aprendizaje
          </div>
          <div className="space-y-1">
            {mainItems.map((item) => <NavLink key={item.path} item={item} />)}
          </div>
        </div>

        {/* Progreso y social */}
        <div>
          <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Progreso & Rankings
          </div>
          <div className="space-y-1">
            {progressItems.map((item) => <NavLink key={item.path} item={item} />)}
          </div>
        </div>

        {/* Cuenta */}
        <div>
          <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Cuenta
          </div>
          <div className="space-y-1">
            {accountItems.map((item) => <NavLink key={item.path} item={item} />)}
          </div>
        </div>
      </div>

      {/* RLS Badge */}
      <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-cyan-500/30 text-xs space-y-2 mt-4">
        <div className="flex items-center gap-2 text-cyan-400 font-extrabold">
          <span>🔒 Aislamiento PostgreSQL RLS</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-normal">
          Tus datos están aislados y encriptados de otros usuarios en el backend.
        </p>
      </div>
    </aside>
  )
}
