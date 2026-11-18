'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getContainer } from '@/infrastructure/di/container'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')

    try {
      const container = getContainer()
      await container.useCases.login.execute({ email, password })
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Credenciales inválidas o error de conexión.')
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
          <h1 className="text-2xl font-black text-white">DevFluency AI</h1>
          <p className="text-xs text-slate-400 mt-1">Iniciar Sesión Multi-Tenant Segura</p>
        </div>

        {error && (
          <div className="bg-rose-500/20 text-rose-300 border border-rose-500/40 p-3 rounded-xl text-xs font-bold mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
              Correo Electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="developer@enterprise.com"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white text-sm focus:outline-none focus:border-cyan-500 transition-all font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••••••"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white text-sm focus:outline-none focus:border-cyan-500 transition-all font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary text-center mt-2 disabled:opacity-50"
          >
            {loading ? '🔐 Autenticando...' : 'Iniciar Sesión →'}
          </button>
        </form>

        <div className="text-center mt-6 pt-4 border-t border-white/10 text-xs text-slate-400">
          ¿No tienes una cuenta?{' '}
          <Link href="/register" className="text-cyan-400 font-bold hover:underline">
            Regístrate gratis
          </Link>
        </div>
      </div>
    </div>
  )
}
