"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { api } from "../../../_lib/api"
import { errorMessage } from "../../../_lib/types"

export default function UploadTenderPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    if (!file.name.toLowerCase().endsWith(".pdf")) { setError("Only PDF files are accepted"); return }
    if (file.size > 15 * 1024 * 1024) { setError("PDF must be 15 MB or smaller"); return }
    setError("")
    setUploading(true)
    try {
      const tender = await api.tenders.upload(file)
      router.push(`/tenders/${tender.id}`)
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto mt-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Upload Tender PDF</h1>
        <p className="text-sm text-zinc-400 mt-1">AI will analyze the document automatically</p>
      </div>

      <form onSubmit={handleSubmit} className="glass rounded-xl p-8 space-y-6">
        {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        <div className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 rounded-xl p-10 text-center hover:border-blue-500/50 transition-colors cursor-pointer"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f) setFile(f)
          }}
          onClick={() => document.getElementById("pdf-input")?.click()}>
          <div className="text-4xl text-zinc-600 mb-4">◇</div>
          <p className="text-sm text-zinc-300 font-medium">{file ? file.name : "Drop your PDF here or click to browse"}</p>
          <p className="text-xs text-zinc-500 mt-1">Government tender documents in PDF format</p>
          <input id="pdf-input" type="file" accept=".pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>

        {file && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
            <div className="text-lg text-blue-400">◇</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{file.name}</p>
              <p className="text-xs text-zinc-500">{file.size < 1048576 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</p>
            </div>
            <button type="button" onClick={() => setFile(null)} className="text-xs text-zinc-500 hover:text-red-400">Remove</button>
          </div>
        )}

        <button type="submit" disabled={!file || uploading}
          className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20">
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing with AI...
            </span>
          ) : "Upload & Analyze"}
        </button>
      </form>
    </div>
  )
}
