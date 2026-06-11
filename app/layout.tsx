import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ezclaude — Claude, made easy for non-coders',
  description: 'Ask, create, and build with Claude — no code. Chat, make documents/decks/spreadsheets, and ship real apps, all in one place.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet"/>
      </head>
      <body style={{margin:0, background:'#05050d', color:'#f0f0fa', fontFamily:"'DM Sans', sans-serif"}}>
        {children}
      </body>
    </html>
  )
}
