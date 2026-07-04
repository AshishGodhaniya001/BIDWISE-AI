"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { api } from "./api"
import type { UserProfile } from "./types"


interface AuthContextType {
  user: UserProfile | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function refreshUser() {
    try {
      setUser(await api.auth.profile())
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void api.auth.profile()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    await api.auth.login({ email, password })
    await refreshUser()
  }

  async function register(name: string, email: string, password: string) {
    await api.auth.register({ name, email, password })
    await refreshUser()
  }

  async function logout() {
    await api.auth.logout().catch(() => undefined)
    setUser(null)
    window.location.assign("/login")
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
