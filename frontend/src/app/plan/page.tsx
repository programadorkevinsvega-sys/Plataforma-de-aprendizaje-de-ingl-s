'use client'

import React, { useState } from 'react'
import { Navbar } from '@/presentation/components/Navbar'

const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export default function PlanPage() {
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [sessionMinutes, setSessionMinutes] = useState('20')
  const [preferredTime, setPreferredTime] = useState('Mañanas')

  const toggleDay = (day: string) => {
    setSelectedDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">Plan personalizado</h1>
            <p className="mt-1 text-sm">Basado en tus resultados reales de práctica y evaluaciones.</p>
          </div>
          <button disabled className="rounded-xl border border-emerald-700/20 px-4 py-3 text-xs font-bold text-emerald-800 disabled:opacity-50">Editar objetivos · próximamente</button>
        </header>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Objetivos de aprendizaje</h2>
            <div className="mt-4 rounded-xl border border-dashed border-stone-200 p-5">
              <p className="text-sm font-semibold">Todavía no tienes objetivos de aprendizaje personalizados.</p>
              <p className="mt-1 text-xs">Los objetivos se definirán usando tu nivel diagnosticado, resultados y fecha meta.</p>
            </div>
          </article>

          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Preferencias y disponibilidad</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={selectedDays.includes(day)}
                  className={'grid h-10 w-10 place-items-center rounded-xl border text-xs font-bold ' + (selectedDays.includes(day) ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-white')}
                >
                  {day}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold">Minutos por sesión
                <select value={sessionMinutes} onChange={(event) => setSessionMinutes(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm">
                  <option value="10">10 minutos</option>
                  <option value="20">20 minutos</option>
                  <option value="30">30 minutos</option>
                  <option value="45">45 minutos</option>
                  <option value="60">60 minutos</option>
                </select>
              </label>
              <label className="text-xs font-semibold">Horario preferido
                <select value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm">
                  <option>Mañanas</option>
                  <option>Tardes</option>
                  <option>Noches</option>
                </select>
              </label>
            </div>
            <p className="mt-3 text-[11px]">Selección temporal en esta pantalla. La disponibilidad aún no se guarda en el backend.</p>
          </article>
        </section>

        <article className="glass-panel rounded-2xl p-5">
          <h2 className="text-lg font-bold">Plan semanal</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((day, index) => (
              <div key={day} className="min-h-28 rounded-xl border border-stone-200 p-3">
                <strong className="text-xs">{day}</strong>
                <p className="mt-4 text-xs">{selectedDays.includes(days[index]) ? 'Día seleccionado' : 'Sin disponibilidad seleccionada'}</p>
              </div>
            ))}
          </div>
        </article>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Debilidades detectadas</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-5">
              <p className="text-sm font-semibold">Aún no hay resultados suficientes para detectar áreas débiles.</p>
              <p className="mt-1 text-xs">Las debilidades se calcularán a partir de ejercicios y evaluaciones con evidencia válida por competencia.</p>
            </div>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Ejercicios de refuerzo</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-5">
              <p className="text-sm font-semibold">No hay ejercicios personalizados disponibles todavía.</p>
              <p className="mt-1 text-xs">Después del diagnóstico, aquí aparecerán actividades vinculadas a tus debilidades.</p>
            </div>
          </article>
        </section>

        <article className="glass-panel rounded-2xl p-5">
          <h2 className="text-lg font-bold">Evolución del plan</h2>
          <p className="mt-2 text-sm">La evolución se mostrará cuando el recomendador registre objetivos y planes basados en tus resultados.</p>
          <div className="mt-4 rounded-xl bg-stone-50 p-4 text-xs">
            Sin un plan activo, no hay porcentaje de avance que mostrar.
          </div>
        </article>
      </main>
    </div>
  )
}
