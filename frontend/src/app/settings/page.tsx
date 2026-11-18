'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/presentation/components/Navbar'
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
    let active = true
    getContainer().useCases.getCurrentUser.execute().then((currentUser) => {
      if (!currentUser) {
        router.replace('/login')
        return
      }
      if (!active) return
      setUser(currentUser)
      setForm((previous) => ({
        ...previous,
        fullName: currentUser.fullName || '',
        targetRole: currentUser.targetRole || 'Software Engineer',
        currentLevel: currentUser.currentLevel || 'A2',
      }))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [router])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updatedUser = await getContainer().useCases.updateProfile.execute({
        fullName: form.fullName,
        targetRole: form.targetRole,
        currentLevel: form.currentLevel as CefrLevel,
      })
      setUser(updatedUser)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    await getContainer().useCases.logout?.execute()
    sessionStorage.clear()
    router.push('/login')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Cargando tu cuenta…</div>

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
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-lg font-extrabold text-emerald-800">{user?.initials || 'U'}</span>
              <div><strong className="block text-sm">{user?.fullName}</strong><span className="text-xs">{user?.email}</span></div>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold">Nombre
                <input value={form.fullName} onChange={(event) => setForm((state) => ({ ...state, fullName: event.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" />
              </label>
              <label className="block text-xs font-semibold">Objetivo profesional
                <select value={form.targetRole} onChange={(event) => setForm((state) => ({ ...state, targetRole: event.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm">
                  {['Software Engineer', 'Backend Developer', 'Frontend Developer', 'Full Stack Developer', 'DevOps Engineer', 'Data Engineer', 'ML Engineer', 'Engineering Manager'].map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold">Nivel de referencia
                <select value={form.currentLevel} onChange={(event) => setForm((state) => ({ ...state, currentLevel: event.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm">
                  {(['A0', 'A1', 'A2', 'B1', 'B2', 'C1'] as const).map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
              <button onClick={() => void handleSave()} disabled={saving} className="btn-primary w-full">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Mi nivel y objetivos</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-4">
              <div className="flex items-center justify-between"><strong className="text-sm">Nivel de referencia: {user?.currentLevel}</strong><span className="text-xs">Estimación pendiente</span></div>
              <p className="mt-2 text-xs">El nivel del perfil no sustituye un diagnóstico académico ni una medición de dominio.</p>
            </div>
            <Link href="/evaluations" className="mt-4 inline-flex text-sm font-bold text-emerald-800">Consultar diagnóstico y evaluaciones →</Link>
            <div className="mt-4 rounded-xl border border-dashed border-stone-200 p-4">
              <strong className="text-sm">Objetivo personal</strong>
              <p className="mt-1 text-xs">Configurar objetivos personalizados estará disponible cuando se integre el plan de aprendizaje.</p>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Preferencias de aprendizaje</h2>
            <div className="mt-4 space-y-4">
              {[
                { key: 'emailNotifications', label: 'Notificaciones por email', description: 'Resúmenes y avisos de actividad' },
                { key: 'dailyReminder', label: 'Recordatorio diario', description: 'Recordatorio para mantener tu hábito' },
              ].map((item) => (
                <label key={item.key} className="flex items-center justify-between gap-3">
                  <span><strong className="block text-sm">{item.label}</strong><span className="text-xs">{item.description}</span></span>
                  <input type="checkbox" checked={Boolean(form[item.key as 'emailNotifications' | 'dailyReminder'])} onChange={(event) => setForm((state) => ({ ...state, [item.key]: event.target.checked }))} className="h-4 w-4 accent-emerald-700" />
                </label>
              ))}
              <label className="block text-xs font-semibold">Hora preferida del recordatorio
                <input type="time" value={form.reminderTime} onChange={(event) => setForm((state) => ({ ...state, reminderTime: event.target.value }))} className="mt-1 rounded-xl border px-3 py-2 text-sm" />
              </label>
            </div>
            <p className="mt-3 text-xs">Estas preferencias son controles visuales; todavía no se guardan en el backend.</p>
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Notificaciones</h2>
            <div className="mt-4 space-y-3 text-sm">
              <p className="rounded-xl bg-stone-50 p-4">Los avisos de repasos, misiones y logros se integrarán cuando exista el servicio de notificaciones.</p>
            </div>
            <h2 className="mt-6 text-lg font-bold">Privacidad y datos</h2>
            <p className="mt-2 text-xs">Consulta la política de privacidad de la plataforma antes de compartir información sensible.</p>
            <div className="mt-4 rounded-xl border border-dashed border-stone-200 p-4">
              <strong className="text-sm">Exportación y eliminación de datos</strong>
              <p className="mt-1 text-xs">Estas acciones todavía no están disponibles desde la interfaz.</p>
            </div>
          </article>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-5">
          <div><strong className="text-sm">Sesión de usuario</strong><p className="mt-1 text-xs">Cierra tu sesión de forma segura en este dispositivo.</p></div>
          <button onClick={() => void handleLogout()} className="rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700">Cerrar sesión</button>
        </section>
      </main>
    </div>
  )
}
