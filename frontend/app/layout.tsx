import type { Metadata } from "next"
import { Poppins } from "next/font/google"
import "./globals.css"
import { ToastProvider } from "./_components/ToastProvider"

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "BidWise AI - Intelligent Tender Analysis",
  description: "AI-powered government tender analysis & proposal generation platform",
  icons: { icon: "/favicon.svg" },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
        <ToastProvider />
      </body>
    </html>
  )
}
