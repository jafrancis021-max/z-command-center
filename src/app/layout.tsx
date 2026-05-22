import type { Metadata } from 'next'
import './globals.css'
import ZAssistantPanel from '@/components/ZAssistantPanel'
import ZNavSidebar from '@/components/ZNavSidebar'
import CommandPalette from '@/components/CommandPalette'

export const metadata: Metadata = {
  title: 'Z Command Center',
  description: 'Personal AI operational dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F7F8FA] text-[#111827] lg:pl-56 lg:pr-72">
        <ZNavSidebar />
        {children}
        <ZAssistantPanel />
        <CommandPalette />
      </body>
    </html>
  )
}
