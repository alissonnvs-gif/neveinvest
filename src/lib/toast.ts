import { create } from 'zustand'

export type ToastType = 'success' | 'error'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastStore {
  toasts: Toast[]
  show: (message: string, type: ToastType) => void
  dismiss: (id: string) => void
}

const TOAST_DURATION_MS = 3500

// Store separado do useStore principal: toasts são estado efêmero de UI, não devem
// persistir no localStorage nem sincronizar com o Supabase junto do estado financeiro.
export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (message, type) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), TOAST_DURATION_MS)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const showSuccessToast = (message: string) => useToastStore.getState().show(message, 'success')
export const showErrorToast = (message: string) => useToastStore.getState().show(message, 'error')
