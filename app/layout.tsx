import type { Metadata } from 'next'
import { Inter, Lora } from 'next/font/google'
import SiteFooter from '@/components/SiteFooter'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
})

export const metadata: Metadata = {
  title: "Chilli's Adventure Journal",
  description: 'Dispatches from the Sierra Nevada — Truckee, CA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable}`}>
      <body>
        {children}
        <SiteFooter />
      </body>
    </html>
  )
}
