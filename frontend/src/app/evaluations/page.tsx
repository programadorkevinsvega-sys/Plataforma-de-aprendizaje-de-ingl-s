'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Navbar } from '@/presentation/components/Navbar'

const tabs = ['Por unidad', 'Por curso', 'Escrita', 'Hablada', 'Comprensión auditiva'] as const

export default function EvaluationsPage() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Por unidad')

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">Diagnóstico y evaluaciones</h1>
            <p className="mt-1 text-sm">Consulta tu nivel y las competencias que has evaluado.</p>
          </div>
          <Link href="/interview" className="btn-primary">Practicar entrevista técnica</Link>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="Tipo de evaluación">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={'rounded-full border px-4 py-2 text-xs font-semibold ' + (activeTab === tab ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50')}>
              {tab}
            </button>
          ))}
        </nav>

        <section className="glass-panel rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Resultado detallado · {activeTab}</h2>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-800">Sin resultados registrados</span>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { title: 'Evaluación escrita', detail: 'Gramática, vocabulario, coherencia y adecuación comunicativa.' },
              { title: 'Evaluación hablada', detail: 'Pronunciación y fluidez solo cuando exista audio analizable.' },
              { title: 'Comprensión auditiva', detail: 'Actividades cuyo estímulo principal sea escuchar un audio.' },
            ].map((item) => (
              <div key={item.title} className="rounded-xl bg-stone-50 p-4">
                <strong className="text-sm">{item.title}</strong>
                <p className="mt-2 text-xs">{item.detail}</p>
                <p className="mt-4 text-xl font-extrabold">—</p>
                <span className="text-[10px]">Aún sin medir</span>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl bg-[#f4f1e7] p-4 text-xs">
            Las puntuaciones escritas y habladas se calcularán por separado. La pronunciación y la fluidez oral no se inferirán a partir de una transcripción.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Dominio por competencia</h2>
            <div className="mt-4 space-y-4">
              {['Vocabulario', 'Gramática', 'Reading', 'Listening', 'Speaking'].map((skill) => (
                <div key={skill}>
                  <div className="flex justify-between text-sm"><strong>{skill}</strong><span className="text-xs">Sin evidencia</span></div>
                  <div className="mt-2 h-2 rounded-full bg-stone-100" />
                </div>
              ))}
            </div>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <h2 className="text-lg font-bold">Historial de evaluaciones</h2>
            <div className="mt-4 rounded-xl bg-stone-50 p-5">
              <p className="text-sm font-semibold">Todavía no hay evaluaciones académicas consolidadas.</p>
              <p className="mt-1 text-xs">El historial aparecerá cuando el diagnóstico y las evaluaciones por modalidad estén conectados al motor académico.</p>
            </div>
          </article>
        </section>
        <p className="text-xs">La práctica de entrevista existente sigue disponible, pero sus métricas heredadas no representan por sí solas una medición calibrada de nivel CEFR.</p>
      </main>
    </div>
  )
}
