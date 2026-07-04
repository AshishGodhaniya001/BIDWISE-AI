"use client"

import { useEffect, useState } from "react"

export type ToastType = "success" | "error" | "info"

export interface ToastMessage {
  id: number
  message: string
  type: ToastType
}

let toastId = 0
let addToastFn: ((msg: Omit<ToastMessage, "id">) => void) | null = null

export function showToast(message: string, type: ToastType = "error") {
  addToastFn?.({ message, type })
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    addToastFn = (msg) => {
      const id = ++toastId
      setToasts((prev) => [...prev, { ...msg, id }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 4000)
    }
    return () => { addToastFn = null }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-slide-up rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            t.type === "error"
              ? "bg-red-600 text-white"
              : t.type === "success"
                ? "bg-green-600 text-white"
                : "bg-zinc-800 text-zinc-100"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
