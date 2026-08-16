'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { Sidebar } from '@/presentation/components/Sidebar'
import { getContainer } from '@/infrastructure/di/container'
import type { User } from '@/domain/entities/User'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [fullName, setFullName] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((u) => {
      if (!u) {
        router.push('/login')
        return
      }
      setUser(u)
      setFullName(u.fullName)
      setTargetRole(u.targetRole)
      setLoading(false)
    })
  }, [router])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    const container = getContainer()
    const updated = await container.useCases.updateProfile.execute({
      fullName,
      targetRole,
    })
    setUser(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center text-cyan-400 font-mono text-sm">
        👤 Cargando Perfil...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col">
      <Navbar />

      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-6 max-w-4xl space-y-6">
          <div>
            <h1 className="text-2xl font-black text-white">Perfil & Seguridad Multi-Tenant</h1>
            <p className="text-xs text-slate-400">Tus datos están aislados por cliente mediante políticas PostgreSQL RLS</p>
          </div>

          {saved && (
            <div className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 p-3 rounded-xl text-xs font-bold">
              ✅ Perfil actualizado correctamente.
            </div>
          )}

          <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-6">
            <div className="flex items-center gap-4 pb-6 border-b border-white/10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-black text-black text-2xl shadow-lg shadow-cyan-500/20">
                {user.fullName.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{user.fullName}</h2>
                <p className="text-xs text-slate-400 font-mono">{user.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="bg-cyan-500/20 text-cyan-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                    ID RLS: {user.id}
                  </span>
                  <span className="bg-purple-500/20 text-purple-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-purple-500/30">
                    Nivel {user.currentLevel}
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white text-sm focus:outline-none focus:border-cyan-500 transition-all font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Rol Objetivo (Target Role)
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white text-sm focus:outline-none focus:border-cyan-500 transition-all font-mono"
                />
              </div>

              <button type="submit" className="btn-primary text-center">
                Guardar Cambios →
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  )
}
