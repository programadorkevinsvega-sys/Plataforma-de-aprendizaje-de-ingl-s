'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getContainer } from '@/infrastructure/di/container'
import type { CefrLevel, User } from '@/domain/entities/User'

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    fullName: '',
    targetRole: '',
    currentLevel: '',
    emailNotifications: true,
    dailyReminder: true,
    reminderTime: '08:00',
  })

  useEffect(() => {
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((u) => {
      if (!u) { router.push('/login'); return }
      setUser(u)
      setForm(f => ({
        ...f,
        fullName: u.fullName || '',
        targetRole: u.targetRole || 'Software Engineer',
        currentLevel: u.currentLevel || 'A2',
      }))
      setLoading(false)
    })
  }, [router])

  const handleSave = async () => {
    setSaving(true)
    try {
      const container = getContainer()
      const updatedUser = await container.useCases.updateProfile.execute({
        fullName: form.fullName,
        targetRole: form.targetRole,
        currentLevel: form.currentLevel as CefrLevel,
      })
      setUser(updatedUser)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Error guardando perfil:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    const container = getContainer()
    container.useCases.logout?.execute()
    sessionStorage.clear()
    router.push('/login')
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center text-slate-400 font-mono text-sm">
      ⚙️ Cargando Configuración...
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl font-black text-white">
              {user?.fullName?.charAt(0) || 'U'}
            </div>
            <div>
              <h1 className="text-xl font-black text-white">{user?.fullName}</h1>
              <p className="text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Perfil */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Perfil de Aprendizaje</h2>

          <div>
            <label className="text-xs font-bold text-slate-400 block mb-1">Nombre Completo</label>
            <input
              type="text"
              value={form.fullName}
              onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="Tu nombre completo"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 block mb-1">Rol Objetivo en Tech</label>
            <select
              value={form.targetRole}
              onChange={e => setForm(f => ({ ...f, targetRole: e.target.value }))}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
            >
              {['Software Engineer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer', 'DevOps Engineer', 'Data Engineer', 'ML Engineer', 'Engineering Manager'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 block mb-1">Nivel Actual de Inglés</label>
            <div className="grid grid-cols-6 gap-2">
              {['A0', 'A1', 'A2', 'B1', 'B2', 'C1'].map(l => (
                <button
                  key={l}
                  onClick={() => setForm(f => ({ ...f, currentLevel: l }))}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${form.currentLevel === l ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Notificaciones */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Notificaciones</h2>

          {[
            { key: 'emailNotifications', label: 'Notificaciones por Email', desc: 'Recibe resúmenes semanales de progreso' },
            { key: 'dailyReminder', label: 'Recordatorio Diario', desc: 'Aviso push para mantener tu racha' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">{label}</div>
                <div className="text-xs text-slate-400">{desc}</div>
              </div>
              <button
                onClick={() => setForm(f => ({ ...f, [key]: !f[key as keyof typeof f] }))}
                className={`w-11 h-6 rounded-full border transition-all relative ${form[key as keyof typeof form] ? 'bg-cyan-500/20 border-cyan-500/40' : 'bg-slate-700/50 border-slate-600'}`}
              >
                <div className={`w-4 h-4 rounded-full absolute top-0.5 transition-all ${form[key as keyof typeof form] ? 'right-0.5 bg-cyan-400' : 'left-0.5 bg-slate-500'}`} />
              </button>
            </div>
          ))}

          {form.dailyReminder && (
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">Hora del recordatorio</label>
              <input
                type="time"
                value={form.reminderTime}
                onChange={e => setForm(f => ({ ...f, reminderTime: e.target.value }))}
                className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="space-y-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-3 rounded-2xl text-sm font-bold transition-all ${saved ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300' : 'btn-primary'}`}
          >
            {saving ? '⏳ Guardando...' : saved ? '✅ Cambios Guardados' : 'Guardar Cambios'}
          </button>

          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-2xl text-sm font-bold border border-rose-500/30 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-all"
          >
            🚪 Cerrar Sesión
          </button>
        </div>

        <div className="text-center text-xs text-slate-600 pb-6">
          DevFluency AI v2.0 Enterprise — Rust + Next.js + PostgreSQL
        </div>
      </div>
    </div>
  )
}
