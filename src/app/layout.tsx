import type { Metadata } from 'next'
import './globals.css'
import ZOperationalSidebar from '@/components/ZOperationalSidebar'

export const metadata: Metadata = {
  title: 'Z Command Center',
  description: 'Personal AI operational dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] lg:pr-72">
        {children}
        <ZOperationalSidebar />
      </body>
    </html>
  )
}
