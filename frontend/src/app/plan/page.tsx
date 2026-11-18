'use client'

import React from 'react'
import Link from 'next/link'
import { Navbar } from '@/presentation/components/Navbar'

const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function PlanPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">Plan personalizado</h1>
            <p className="mt-1 text-sm">Un plan construido a partir de tus resultados, objetivos y disponibilidad.</p>
          </div>
          <Link href="/evaluations" className="btn-primary">Realizar diagnóstico</Link>
        </header>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Objetivos de aprendizaje</h2>
            <div className="mt-4 rounded-xl border border-dashed border-stone-200 p-5">
              <strong className="text-sm">Todavía no hay objetivos personalizados.</strong>
              <p className="mt-1 text-xs">Podrás establecer objetivos cuando esté disponible la configuración del plan.</p>
            </div>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Preferencias y disponibilidad</h2>
            <div className="mt-4 grid grid-cols-7 gap-2">
              {days.map((day) => <div key={day} className="rounded-lg bg-stone-50 py-3 text-center text-xs font-semibold">{day}<span className="mt-2 block text-stone-400">—</span></div>)}
            </div>
            <p className="mt-3 text-xs">No hay horarios ni duración de sesión configurados.</p>
          </article>
        </section>

        <article className="glass-panel rounded-2xl p-5">
          <h2 className="text-lg font-bold">Plan semanal</h2>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {days.map((day) => <div key={day} className="min-h-24 rounded-xl border border-stone-200 p-3"><strong className="text-xs">{day}</strong><p className="mt-3 text-xs">Sin actividad programada</p></div>)}
          </div>
        </article>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Debilidades detectadas</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-5">
              <p className="text-sm font-semibold">Aún no hay resultados suficientes para detectar áreas débiles.</p>
              <p className="mt-1 text-xs">Las debilidades se calcularán a partir de ejercicios y evaluaciones con evidencia válida.</p>
            </div>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Ejercicios de refuerzo</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-5">
              <p className="text-sm font-semibold">No hay refuerzos personalizados disponibles.</p>
              <Link href="/learn" className="mt-2 inline-flex text-xs font-bold text-emerald-800">Ir al centro de práctica →</Link>
            </div>
          </article>
        </section>

        <article className="glass-panel rounded-2xl p-5">
          <h2 className="text-lg font-bold">Evolución del plan</h2>
          <p className="mt-2 text-sm">La evolución se mostrará cuando el recomendador registre planes y cambios basados en tus resultados.</p>
          <div className="mt-4 h-2 rounded-full bg-stone-100" />
        </article>
      </main>
    </div>
  )
}
