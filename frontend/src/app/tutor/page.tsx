'use client'

import React, { useState } from 'react'
import { Navbar } from '@/presentation/components/Navbar'

const scenarios = [
  { name: 'Conversación libre', detail: 'Habla de lo que quieras' },
  { name: 'Conversación guiada', detail: 'Con objetivos paso a paso' },
  { name: 'Inglés cotidiano y viajes', detail: 'Aeropuerto, hotel, restaurante' },
  { name: 'Inglés profesional', detail: 'Reuniones y trabajo en equipo' },
  { name: 'Entrevistas técnicas', detail: 'Preguntas de ingeniería' },
  { name: 'Code review', detail: 'Situaciones tecnológicas' },
]

export default function TutorPage() {
  const [selected, setSelected] = useState('Code review')

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header>
          <h1 className="text-3xl font-extrabold">Tutor conversacional</h1>
          <p className="mt-1 text-sm">Practica conversaciones reales con feedback inmediato.</p>
        </header>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <h2 className="mb-3 text-sm font-bold">Escenarios</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.name}
                  type="button"
                  onClick={() => setSelected(scenario.name)}
                  aria-pressed={selected === scenario.name}
                  className={'glass-panel min-h-20 rounded-2xl p-4 text-left transition-colors ' + (selected === scenario.name ? 'border-emerald-700/50 bg-emerald-50' : 'hover:bg-stone-50')}
                >
                  <strong className="block text-sm">{scenario.name}</strong>
                  <span className="mt-1 block text-xs">{scenario.detail}</span>
                </button>
              ))}
            </div>
          </div>

          <article className="glass-panel flex min-h-[620px] flex-col rounded-2xl p-5">
            <div className="border-b border-stone-100 pb-4">
              <h2 className="text-lg font-bold">Conversación · {selected}</h2>
              <p className="mt-1 text-xs">Espacio para practicar con el tutor de IA.</p>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-stone-50 p-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-xl text-emerald-800">✦</span>
              <h3 className="mt-4 text-base font-bold">Aún no hay una conversación iniciada</h3>
              <p className="mt-2 max-w-md text-xs leading-5">El diseño de esta experiencia está preparado, pero el servicio conversacional y la persistencia de mensajes todavía no están integrados. No se enviará texto ni audio hasta conectar ese servicio.</p>
              <span className="mt-4 rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-bold text-amber-800">Tutor IA no conectado</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <input disabled placeholder="Escribe tu respuesta" className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm disabled:bg-stone-50" />
              <button disabled className="rounded-xl bg-stone-200 px-5 py-3 text-xs font-bold text-stone-500">Enviar</button>
              <button disabled className="rounded-xl border border-emerald-700/20 px-4 py-3 text-xs font-bold text-emerald-800">Hablar</button>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Resumen de la última sesión</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-4">
              <p className="text-sm font-semibold">Todavía no hay sesiones de tutor almacenadas.</p>
              <p className="mt-1 text-xs">Duración, correcciones y palabras nuevas aparecerán cuando exista una sesión real.</p>
            </div>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Historial</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-4">
              <p className="text-sm font-semibold">No hay conversaciones anteriores.</p>
              <p className="mt-1 text-xs">El historial se habilitará con la persistencia del tutor.</p>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
