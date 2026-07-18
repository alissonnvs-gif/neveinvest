import { useToastStore } from '../lib/toast'

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-sm px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg border text-sm font-medium cursor-pointer
            ${t.type === 'success'
              ? 'bg-emerald-900/95 border-emerald-700 text-emerald-200'
              : 'bg-red-900/95 border-red-700 text-red-200'}`}
        >
          <span>{t.type === 'success' ? '✅' : '⚠️'}</span>
          <span className="flex-1">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
