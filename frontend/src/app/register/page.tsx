'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getContainer } from '@/infrastructure/di/container'
import type { TargetRole, CefrLevel } from '@/domain/entities/User'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [targetRole, setTargetRole] = useState<TargetRole>('BACKEND')
  const [currentLevel, setCurrentLevel] = useState<CefrLevel>('A1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName || !email || !password) return
    setLoading(true)
    setError('')

    try {
      const container = getContainer()
      await container.useCases.register.execute({
        fullName,
        email,
        password,
        targetRole,
        currentLevel,
      })
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al registrar usuario. Verifica las reglas de formulario.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d13] flex items-center justify-center p-6 text-slate-100">
      <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-white/10 relative">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-black text-black text-2xl mx-auto mb-3 shadow-lg shadow-cyan-500/20">
            DF
          </div>
          <h1 className="text-2xl font-black text-white">Crear Cuenta DevFluency</h1>
          <p className="text-xs text-slate-400 mt-1">Aislamiento Multi-Tenant & JWT Ed25519</p>
        </div>

        {error && (
          <div className="bg-rose-500/20 text-rose-300 border border-rose-500/40 p-3.5 rounded-xl text-xs font-bold mb-4 leading-relaxed">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
              Nombre Completo
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Kevin Software Developer"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white text-sm focus:outline-none focus:border-cyan-500 transition-all font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
              Correo Electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="yesidvegamar@gmail.com"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white text-sm focus:outline-none focus:border-cyan-500 transition-all font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Rol Objetivo
              </label>
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as TargetRole)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white text-xs focus:outline-none focus:border-cyan-500 transition-all font-bold"
              >
                <option value="BACKEND">Backend (Rust / Go)</option>
                <option value="DEVOPS">DevOps / SRE</option>
                <option value="FULLSTACK">Fullstack Engineer</option>
                <option value="MOBILE">Mobile Engineer</option>
                <option value="DATA">Data / ML Engineer</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
                Nivel Inicial
              </label>
              <select
                value={currentLevel}
                onChange={(e) => setCurrentLevel(e.target.value as CefrLevel)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white text-xs focus:outline-none focus:border-cyan-500 transition-all font-bold"
              >
                <option value="A0">A0 (Principiante Cero)</option>
                <option value="A1">A1 (Básico Inicial)</option>
                <option value="A2">A2 (Standups & PRs)</option>
                <option value="B1">B1 (Code Review)</option>
                <option value="B2">B2 (System Design)</option>
                <option value="C1">C1 (Tech Lead)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
              Contraseña Segura
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Usa al menos 10 caracteres (mayúscula, minúscula, número y símbolo)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white text-sm focus:outline-none focus:border-cyan-500 transition-all font-mono"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              * Mínimo 10 caracteres, 1 mayúscula, 1 minúscula, 1 número y 1 símbolo (ej. <code className="text-cyan-300 font-mono">DevFluency2026!</code>).
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary text-center mt-2 disabled:opacity-50"
          >
            {loading ? '🚀 Registrando...' : 'Registrarme e Iniciar Dashboard →'}
          </button>
        </form>

        <div className="text-center mt-6 pt-4 border-t border-white/10 text-xs text-slate-400">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-cyan-400 font-bold hover:underline">
            Inicia Sesión
          </Link>
        </div>
      </div>
    </div>
  )
}
