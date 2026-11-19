import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fluenta | Aprende inglés con propósito',
  description: 'Plataforma de aprendizaje de inglés general y profesional con cursos, práctica, repaso y acompañamiento inteligente.',
  keywords: ['Aprender inglés', 'Inglés profesional', 'Inglés para tecnología', 'CEFR', 'Pronunciación'],
  icons: { icon: '/favicon.ico', apple: '/apple-icon.png' },
  openGraph: {
    title: 'Fluenta | Aprende inglés con propósito',
    description: 'Una experiencia de aprendizaje de inglés clara, práctica y personalizada.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
