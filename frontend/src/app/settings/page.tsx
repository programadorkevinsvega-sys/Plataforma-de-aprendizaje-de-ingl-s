'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
import { getContainer } from '@/infrastructure/di/container'
import type { User } from '@/domain/entities/User'

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [preferences, setPreferences] = useState({
    autoAudio: true,
    speakingExercises: true,
    darkMode: false,
    dailyReminder: true,
    pendingReviews: true,
    missionsAndAchievements: false,
  })
  const [explanationLanguage, setExplanationLanguage] = useState('Español')

  useEffect(() => {
    let active = true
    getContainer().useCases.getCurrentUser.execute().then((currentUser) => {
      if (!currentUser) {
        router.replace('/login')
        return
      }
      if (!active) return
      setUser(currentUser)
      setFullName(currentUser.fullName)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [router])

  const [loading, setLoading] = useState(true)

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user || saving) return
    setSaving(true)
    try {
      const updated = await getContainer().useCases.updateProfile.execute({
        fullName: fullName.trim(),
        targetRole: user.targetRole,
      })
      setUser(updated)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const togglePreference = (key: keyof typeof preferences) => {
    setPreferences((current) => ({ ...current, [key]: !current[key] }))
  }

  if (loading) return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1 items-center justify-center text-sm">Cargando tu cuenta…</div>
    </div>
  )

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center text-sm">No hay una sesión activa.</div>
  )

  const preferenceRows = [
    { key: 'autoAudio' as const, label: 'Audio automático' },
    { key: 'speakingExercises' as const, label: 'Ejercicios de speaking' },
    { key: 'darkMode' as const, label: 'Modo oscuro' },
  ]
  const notificationRows = [
    { key: 'dailyReminder' as const, label: 'Recordatorio diario' },
    { key: 'pendingReviews' as const, label: 'Repasos pendientes' },
    { key: 'missionsAndAchievements' as const, label: 'Misiones y logros' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header>
          <h1 className="text-3xl font-extrabold">Cuenta y preferencias</h1>
          <p className="mt-1 text-sm">Administra tu perfil y cómo aprendes.</p>
        </header>

        {saved && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Cambios de perfil guardados.</p>}

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Mi perfil</h2>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-lg font-extrabold text-emerald-800">{user.initials}</span>
              <div>
                <strong className="block text-sm">{user.fullName}</strong>
                <span className="text-xs">Nivel académico: {user.currentLevel}</span>
              </div>
            </div>
            <form onSubmit={handleSave} className="mt-4 space-y-3">
              <label className="block text-xs font-semibold">
                Nombre
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} className="mt-1 w-full rounded-xl border px-3 py-3 text-sm" />
              </label>
              <button type="submit" disabled={saving || !fullName.trim()} className="btn-primary w-full">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
            </form>
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Mi nivel y objetivos</h2>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <strong>Nivel actual {user.currentLevel}</strong>
                <span className="text-xs">Nivel de perfil</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-stone-100" />
              <p className="mt-2 text-xs">La progresión hacia el siguiente nivel se mostrará cuando exista un diagnóstico CEFR registrado.</p>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-stone-50 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 font-bold text-emerald-800">1</span>
              <div>
                <strong className="block text-sm">Objetivo profesional</strong>
                <span className="text-xs">{user.targetRole || 'Sin objetivo profesional definido'}</span>
              </div>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Preferencias de aprendizaje</h2>
            <div className="mt-4 space-y-4">
              {preferenceRows.map((item) => (
                <label key={item.key} className="flex items-center gap-3 text-sm">
                  <input type="checkbox" checked={preferences[item.key]} onChange={() => togglePreference(item.key)} className="h-4 w-4 accent-emerald-700" />
                  <span className="font-semibold">{item.label}</span>
                </label>
              ))}
              <label className="block pt-2 text-xs font-semibold">
                Idioma de explicaciones
                <select value={explanationLanguage} onChange={(event) => setExplanationLanguage(event.target.value)} className="mt-2 w-full rounded-xl border px-3 py-3 text-sm">
                  <option>Español</option>
                  <option>English</option>
                </select>
              </label>
            </div>
            <p className="mt-3 text-[11px]">Las preferencias se muestran como controles de interfaz y todavía no se guardan en el backend.</p>
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Notificaciones</h2>
            <div className="mt-4 space-y-4">
              {notificationRows.map((item) => (
                <label key={item.key} className="flex items-center gap-3 text-sm">
                  <input type="checkbox" checked={preferences[item.key]} onChange={() => togglePreference(item.key)} className="h-4 w-4 accent-emerald-700" />
                  <span className="font-semibold">{item.label}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-[11px]">La configuración visual no activa envíos de notificaciones. Este servicio aún no está conectado.</p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Configuración de cuenta</h2>
            <label className="mt-4 block text-xs font-semibold">
              Correo electrónico
              <input readOnly value={user.email} className="mt-2 w-full rounded-xl border px-3 py-3 text-sm" />
            </label>
            <button disabled className="mt-4 w-full rounded-xl border border-emerald-700/20 px-4 py-3 text-xs font-bold text-emerald-800 disabled:opacity-50">Cambiar contraseña · No disponible</button>
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Privacidad y datos</h2>
            <p className="mt-3 text-sm">Controla qué datos se guardan y solicita una copia de tu información.</p>
            <button disabled className="mt-4 w-full rounded-xl border border-emerald-700/20 px-4 py-3 text-xs font-bold text-emerald-800 disabled:opacity-50">Descargar mis datos · No disponible</button>
            <button disabled className="mt-3 w-full rounded-xl border border-rose-200 px-4 py-3 text-xs font-bold text-rose-700 disabled:opacity-50">Eliminar cuenta · No disponible</button>
          </article>
        </section>
      </main>
    </div>
  )
}
