import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DevFluency AI | English for Software Engineers',
  description:
    'Aprende inglés conversacional de empleo técnico desde el primer día con fonética en español sin IPA y simulación de entrevistas por IA.',
  keywords: [
    'Inglés para Desarrolladores',
    'Inglés Conversacional',
    'Fonética en Español',
    'System Design Interview',
    'Rust',
    'Microservicios',
  ],
  openGraph: {
    title: 'DevFluency AI - Platform for Tech Professionals',
    description: 'Adquisición natural del lenguaje técnico para hispanohablantes.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-[#0b0d13] text-slate-100 min-h-screen selection:bg-cyan-500 selection:text-black font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
