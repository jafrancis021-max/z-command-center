export const dynamic = 'force-dynamic'

export default function ThinkTankPage() {
  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col items-center justify-center px-6">

      <div className="max-w-sm w-full text-center">

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-violet-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M10 2.5a5 5 0 014 8l-.5 1H6.5L6 10.5a5 5 0 014-8z" strokeLinejoin="round" />
            <path d="M7.5 13.5h5M8 16h4" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="text-[20px] font-bold text-gray-900 mb-3">Think Tank</h1>

        <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
          Speculative ideas, hypotheses, and exploratory thinking live here — isolated from your operational workflows and case intelligence.
        </p>

        {/* Isolation notice */}
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-4 mb-6 text-left">
          <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-[0.1em] mb-2">Isolation Policy</p>
          <ul className="space-y-1.5">
            {[
              'Think Tank content never auto-populates assistant context',
              'Ideas here do not influence case recommendations or approvals',
              'Content must be explicitly requested to surface in Z conversations',
              'Authority level: Low — treated as exploratory, not operational evidence',
            ].map(rule => (
              <li key={rule} className="flex items-start gap-2 text-[11px] text-violet-700">
                <span className="shrink-0 mt-[3px] w-1 h-1 rounded-full bg-violet-400" />
                {rule}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] text-gray-400">
          Think Tank workspace coming soon. Notes and ideas added here will be classified as speculative and kept separate from your operational intelligence.
        </p>

      </div>

    </div>
  )
}
