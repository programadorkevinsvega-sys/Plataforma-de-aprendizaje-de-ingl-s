'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { getContainer } from '@/infrastructure/di/container'
import type { User } from '@/domain/entities/User'

export default function LandingPage() {
  const [user, setUser] = useState<User | null>(null)
  const [activePhoneticTab, setActivePhoneticTab] = useState(0)

  useEffect(() => {
    const container = getContainer()
    container.useCases.getCurrentUser.execute().then((u) => {
      setUser(u)
    })
  }, [])

  const phoneticExamples = [
    {
      word: 'Microservices',
      english: 'We refactored the monolith into microservices.',
      phonetic: 'Güi rifáktord da mónolith íntu máikroservises.',
      spanish: 'Reestructuramos el monolito en microservicios.',
    },
    {
      word: 'Deployment',
      english: 'The automated deployment pipeline succeeded.',
      phonetic: 'Da ótoméitid diplóiment páiplain suksídid.',
      spanish: 'La tubería de despliegue automatizado fue exitosa.',
    },
    {
      word: 'Scalability',
      english: 'Horizontal scaling handles high concurrency spikes.',
      phonetic: 'Jorizóntal skéiling jándols jái konkurrensi spáiks.',
      spanish: 'El escalado horizontal maneja picos de alta concurrencia.',
    },
  ]

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 selection:bg-cyan-500 selection:text-black font-sans antialiased">
      {/* Sleek Minimalist Navbar */}
      <header className="w-full border-b border-white/5 bg-[#07090e]/80 backdrop-blur-xl sticky top-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-purple-600 flex items-center justify-center font-black text-black text-lg shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              DF
            </div>
            <div className="flex flex-col">
              <span className="text-base font-black tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                DevFluency <span className="text-cyan-400">AI</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">Enterprise Edition</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-400">
            <a href="#metodologia" className="hover:text-cyan-400 transition-colors">Metodología Inversa</a>
            <a href="#fonetica" className="hover:text-cyan-400 transition-colors">Fonética sin IPA</a>
            <a href="#simulador" className="hover:text-cyan-400 transition-colors">Reclutador IA</a>
            <a href="#seguridad" className="hover:text-cyan-400 transition-colors">Seguridad Multi-Tenant</a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-black font-extrabold text-xs shadow-lg shadow-cyan-500/20 transition-all"
              >
                Ir a mi Dashboard ({user.fullName.split(' ')[0]}) →
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-xl text-slate-300 hover:text-white font-bold text-xs hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
                >
                  Iniciar Sesión
                </Link>
                <Link
                  href="/register"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-black font-extrabold text-xs shadow-lg shadow-cyan-500/20 transition-all"
                >
                  Comenzar Gratis →
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section (High-Converting Sales Copy) */}
      <section className="relative pt-20 pb-16 px-6 max-w-5xl mx-auto text-center space-y-8 overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/30 text-cyan-400 text-xs font-bold font-mono tracking-wide shadow-inner">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span>Inglés Conversacional para Software Engineers</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-[1.1]">
          Consigue tu próximo empleo en EE. UU.{' '}
          <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            hablando inglés con fluidez.
          </span>
        </h1>

        <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto font-normal leading-relaxed">
          Domina el vocabulario técnico de System Design, Git y Standups. Con <strong className="text-slate-200">fonética natural en español sin símbolos IPA confusos</strong>, simulación de entrevistas por IA y repetición espaciada Anki SM-2.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <Link
            href="/register"
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 hover:from-cyan-300 hover:to-purple-500 text-black font-black text-sm shadow-xl shadow-cyan-500/25 transition-all hover:scale-[1.02]"
          >
            🚀 Crear Cuenta de Desarrollador Gratis →
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white font-bold text-sm border border-slate-800 transition-all"
          >
            🔑 Ya tengo cuenta (Iniciar Sesión)
          </Link>
        </div>

        {/* Social Proof */}
        <div className="pt-8 border-t border-white/5 text-xs text-slate-500 flex flex-wrap items-center justify-center gap-6 font-mono">
          <span>⚡ Rust & Go Engineers</span>
          <span>•</span>
          <span>⚡ DevOps & Cloud Leads</span>
          <span>•</span>
          <span>⚡ Fullstack & Frontend Architects</span>
        </div>
      </section>

      {/* Interactive Demo Preview (Fonética Natural en Español) */}
      <section id="fonetica" className="py-16 px-6 max-w-4xl mx-auto">
        <div className="text-center mb-10 space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            La Experiencia Pedagógica DevFluency
          </h2>
          <p className="text-xs text-slate-400">
            Cero símbolos IPA. Fonética transcrita directamente a pronunciación natural en español con tildes de sonido.
          </p>
        </div>

        <div className="glass-panel p-8 rounded-3xl border border-white/10 relative">
          {/* Tab Selector */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {phoneticExamples.map((item, idx) => (
              <button
                key={idx}
                onClick={() => setActivePhoneticTab(idx)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activePhoneticTab === idx
                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/25'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {item.word}
              </button>
            ))}
          </div>

          {/* Example Box */}
          <div className="bg-slate-950/90 rounded-2xl p-6 border border-slate-800 space-y-4 text-left">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                🇺🇸 Oración en Inglés Técnico
              </div>
              <p className="text-xl font-bold text-white">
                {phoneticExamples[activePhoneticTab].english}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                🔊 Pronunciación en Español Natural (Lee exactamente lo que ves)
              </div>
              <p className="text-lg font-extrabold text-cyan-300 font-mono bg-cyan-950/40 p-3 rounded-xl border border-cyan-800/40">
                {phoneticExamples[activePhoneticTab].phonetic}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                🇪🇸 Traducción
              </div>
              <p className="text-sm font-medium text-slate-300">
                {phoneticExamples[activePhoneticTab].spanish}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Pillars Grid (Minimalist & Professional) */}
      <section id="metodologia" className="py-16 px-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-3 hover:border-cyan-500/40 transition-all">
            <div className="text-xs font-mono font-bold text-cyan-400">01 / APRENDIZAJE INVERSO</div>
            <h3 className="text-xl font-extrabold text-white">Habla primero, entiende después</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Escuchar $\rightarrow$ Repetir $\rightarrow$ Asociar $\rightarrow$ Hablar. Eliminamos la gramática aburrida de las primeras etapas para concentrarte en sonar profesional desde tu primera lección.
            </p>
          </div>

          <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-3 hover:border-purple-500/40 transition-all">
            <div className="text-xs font-mono font-bold text-purple-400">02 / RECLUTADOR IA</div>
            <h3 className="text-xl font-extrabold text-white">Simulador con 6 Métricas</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              AWS Bedrock (Claude 3.5 Sonnet) evalúa tu respuesta en Listening, Pronunciación, Fluidez, Vocabulario, Conversación y Gramática con target obligatorio de $\ge 90.0\%$.
            </p>
          </div>

          <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-3 hover:border-emerald-500/40 transition-all">
            <div className="text-xs font-mono font-bold text-emerald-400">03 / MEMORIA ESPACIADA</div>
            <h3 className="text-xl font-extrabold text-white">Algoritmo Anki SM-2</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Memorice más de 8,000 frases en contexto. El algoritmo programa revisiones según tu curva de olvido para que no gastes tiempo repasando lo que ya sabes.
            </p>
          </div>

          <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-3 hover:border-amber-500/40 transition-all">
            <div className="text-xs font-mono font-bold text-amber-400">04 / SEGURIDAD MULTI-TENANT</div>
            <h3 className="text-xl font-extrabold text-white">PostgreSQL RLS & JWT</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Aislamiento estricto de datos en la base de datos por tenant/usuario. Tu progreso y perfil técnico están 100% encriptados y protegidos.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Footer Banner */}
      <section className="py-16 px-6 max-w-4xl mx-auto text-center">
        <div className="glass-panel p-12 rounded-3xl border border-cyan-500/30 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-3xl font-black text-white">
            ¿Listo para tu próxima entrevista técnica en inglés?
          </h2>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            Únete a la plataforma diseñada exclusivamente para la aceleración del inglés técnico en profesionales de software.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              href="/register"
              className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-black font-extrabold text-xs shadow-lg shadow-cyan-500/20 transition-all"
            >
              🚀 Registrarme Gratis Ahora →
            </Link>
            <Link
              href="/login"
              className="px-8 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 font-bold text-xs border border-cyan-500/30 transition-all"
            >
              🔑 Iniciar Sesión →
            </Link>
          </div>
        </div>
      </section>

      <footer className="w-full py-8 border-t border-white/5 text-center text-xs text-slate-600 font-mono">
        <p>© 2026 DevFluency AI. DDD + Clean Architecture + Rust BFF + AWS Cloud AI.</p>
      </footer>
    </div>
  )
}
