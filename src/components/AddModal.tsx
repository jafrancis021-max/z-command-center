'use client'

import { useState } from 'react'

interface Field {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select'
  placeholder?: string
  options?: { value: string; label: string }[]
  required?: boolean
}

interface Props {
  title: string
  fields: Field[]
  onSubmit: (values: Record<string, string>) => Promise<void>
  onClose: () => void
}

export default function AddModal({ title, fields, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      fields.map(f => [f.key, f.options?.[0]?.value ?? ''])
    )
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await onSubmit(values)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#e5e5e5]">{title}</h3>
          <button onClick={onClose} className="text-[#525252] hover:text-[#a3a3a3] text-lg leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map(field => (
            <div key={field.key}>
              <label className="block text-xs text-[#737373] mb-1">{field.label}</label>
              {field.type === 'textarea' ? (
                <textarea
                  value={values[field.key]}
                  onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  required={field.required}
                  rows={3}
                  className="w-full bg-[#0d0d0d] border border-[#222] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40 resize-none"
                />
              ) : field.type === 'select' ? (
                <select
                  value={values[field.key]}
                  onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                  className="w-full bg-[#0d0d0d] border border-[#222] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] focus:outline-none focus:border-[#f59e0b]/40"
                >
                  {field.options?.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[field.key]}
                  onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  required={field.required}
                  className="w-full bg-[#0d0d0d] border border-[#222] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40"
                />
              )}
            </div>
          ))}

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-xs border border-[#2a2a2a] text-[#737373] px-3 py-2 rounded-lg hover:text-[#a3a3a3] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 text-xs bg-[#f59e0b] text-black font-semibold px-3 py-2 rounded-lg hover:bg-[#d97706] transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
