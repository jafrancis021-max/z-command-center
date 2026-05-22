'use client'

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="max-w-xl mx-auto px-6 py-10">

        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="8" width="5" height="5" rx="1" />
              <rect x="13" y="8" width="5" height="5" rx="1" />
              <rect x="7.5" y="3" width="5" height="5" rx="1" />
              <path d="M4.5 8V6.5a3 3 0 013-3h1M12 5.5h1a3 3 0 013 3V8" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-gray-900 leading-none">Integrations</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Manage workspace integrations</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-blue-700">Active Connections</p>
            <p className="text-[10px] text-blue-500 mt-0.5">Manage your connected services from the Connections page</p>
          </div>
          <a
            href="/connections"
            className="shrink-0 text-[10px] font-semibold text-blue-600 bg-white border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Connections →
          </a>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center">
          <p className="text-[32px] mb-4">🔌</p>
          <p className="text-[13px] font-semibold text-gray-700 mb-2">Advanced Integrations</p>
          <p className="text-[11px] text-gray-400 leading-relaxed max-w-xs mx-auto">
            Webhooks, API keys, and third-party integration settings. Available in an upcoming release.
          </p>
        </div>

        <p className="text-[9px] text-gray-300 text-center mt-8">
          Use the Connections page to connect Gmail, Calendar, and other services
        </p>
      </div>
    </div>
  )
}
