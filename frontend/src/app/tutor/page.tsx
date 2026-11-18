'use client'

import React, { useState } from 'react'
import { Navbar } from '@/presentation/components/Navbar'

const scenarios = [
  { name: 'Conversación libre', detail: 'Habla de lo que quieras' },
  { name: 'Conversación guiada', detail: 'Practica paso a paso con un objetivo' },
  { name: 'Inglés cotidiano y viajes', detail: 'Aeropuerto, hotel y restaurante' },
  { name: 'Inglés profesional', detail: 'Reuniones y trabajo en equipo' },
  { name: 'Entrevistas técnicas', detail: 'Preguntas de ingeniería' },
  { name: 'Code review', detail: 'Explica cambios y decisiones técnicas' },
]

export default function TutorPage() {
  const [selected, setSelected] = useState('Code review')

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header>
          <h1 className="text-3xl font-extrabold">Tutor conversacional</h1>
          <p className="mt-1 text-sm">Practica conversaciones reales y recibe feedback adaptado a tu objetivo.</p>
        </header>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.6fr)]">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Escenarios</h2>
            <div className="mt-4 space-y-2">
              {scenarios.map((scenario) => (
                <button key={scenario.name} onClick={() => setSelected(scenario.name)} className={'w-full rounded-xl border p-4 text-left transition-colors ' + (selected === scenario.name ? 'border-emerald-700 bg-emerald-50' : 'border-stone-200 bg-white hover:bg-stone-50')}>
                  <strong className="block text-sm">{scenario.name}</strong>
                  <span className="mt-1 block text-xs">{scenario.detail}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="glass-panel flex min-h-[560px] flex-col rounded-2xl p-5">
            <div className="border-b border-stone-100 pb-4">
              <h2 className="text-lg font-bold">Conversación · {selected}</h2>
              <p className="mt-1 text-xs">Práctica guiada con un tutor de IA.</p>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-stone-50 p-8 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-2xl">✦</span>
              <h3 className="mt-4 text-lg font-bold">Tu conversación comenzará aquí</h3>
              <p className="mt-2 max-w-md text-sm">La interfaz de tutor está preparada, pero el servicio conversacional aún no está integrado. No se enviarán mensajes hasta que se conecte el proveedor configurado.</p>
              <span className="mt-4 rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-bold text-amber-800">Integración de tutor pendiente</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <input disabled placeholder="El tutor todavía no está disponible" className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm disabled:bg-stone-50" />
              <button disabled className="rounded-xl bg-stone-200 px-5 py-3 text-xs font-bold text-stone-500">Enviar</button>
              <button disabled className="rounded-xl border border-stone-200 px-4 py-3 text-xs font-bold text-stone-400">Hablar</button>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Resumen de la última sesión</h2>
            <p className="mt-3 text-sm">Todavía no hay sesiones de tutor almacenadas.</p>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Historial</h2>
            <p className="mt-3 text-sm">Tus conversaciones aparecerán aquí cuando se habilite la persistencia del tutor.</p>
          </article>
        </section>
      </main>
    </div>
  )
}
