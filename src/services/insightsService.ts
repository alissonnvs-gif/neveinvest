import type { AppState, DailyInsights, InsightSlide } from '../types'
import { CDI_MONTHLY } from '../utils'

function buildPrompt(state: AppState): string {
  const now = new Date()
  const month = now.toISOString().slice(0, 7)
  const today = now.toISOString().slice(0, 10)

  const budget = state.budgets.find((b) => b.month === month)
  const limit = budget?.limit || 8000
  const monthExpenses = state.expenses.filter((e) => e.month === month)
  const totalSpent = monthExpenses.reduce((s, e) => s + e.amount, 0)

  const byCategory: Record<string, number> = {}
  monthExpenses.forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount
  })
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, val]) => `${cat}: R$${val.toFixed(0)}`)
    .join(', ')

  const totalInvested = state.investments.reduce((s, i) => s + i.currentValue, 0)
  const target = state.annualGoal.targetValue
  const goalPct = (target > 0 ? (totalInvested / target) * 100 : 0).toFixed(1)

  const last3Records = state.investmentRecords.slice(-3)
  const avgMonthlyReturn = last3Records.length > 0
    ? last3Records.reduce((s, r) => s + (r.currentValue - r.previousValue), 0) / last3Records.length
    : totalInvested * CDI_MONTHLY
  const cdiRef = totalInvested * CDI_MONTHLY
  const returnVsCdi = avgMonthlyReturn > 0 ? ((avgMonthlyReturn / cdiRef - 1) * 100).toFixed(1) : null

  const portfolioBreakdown = state.investments
    .map((i) => `${i.name} (${i.type}): R$${i.currentValue.toFixed(0)}`)
    .join(', ')

  const pendingExtraordinary = (state.extraordinaryIncomes ?? [])
    .filter((e) => !e.received)
    .map((e) => `${e.description}: R$${e.amount.toFixed(0)} em ${e.expectedDate} (${e.probability}% prob)`)
    .join('; ')

  const monthsLeft = Math.max(1,
    (new Date(state.annualGoal.year, 11, 1).getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
  )

  return `Você é um consultor financeiro pessoal brasileiro, inspirador e perspicaz. Hoje é ${today}.

DADOS DA FAMÍLIA:
- Meta: R$${target.toFixed(0)} até dezembro/2026 (${goalPct}% concluído, ${Math.round(monthsLeft)} meses restantes)
- Carteira atual: R$${totalInvested.toFixed(0)}
- Portfólio: ${portfolioBreakdown}
- Rendimento médio mensal (últimos 3 meses): R$${avgMonthlyReturn.toFixed(0)}${returnVsCdi ? ` (${returnVsCdi > '0' ? '+' : ''}${returnVsCdi}% vs CDI)` : ''}
- Gastos este mês: R$${totalSpent.toFixed(0)} de R$${limit.toFixed(0)} (${((totalSpent/limit)*100).toFixed(0)}% do limite)
- Top categorias: ${topCategories || 'sem gastos registrados este mês'}
- Receitas extraordinárias pendentes: ${pendingExtraordinary || 'nenhuma'}

Gere 4 cards de insights para o app financeiro da família. Responda SOMENTE com JSON válido neste formato exato:
[
  {
    "type": "frase",
    "emoji": "🌟",
    "title": "Frase do Dia",
    "content": "Uma frase motivacional curta e poderosa sobre construção de riqueza ou disciplina financeira. Pode ser de um autor famoso ou original. Máximo 2 linhas.",
    "highlight": null
  },
  {
    "type": "gastos",
    "emoji": "💳",
    "title": "Insight de Gastos",
    "content": "Um insight específico e inteligente baseado nos dados de gastos da família. Seja concreto, cite números, identifique padrões. 2-3 frases.",
    "highlight": "R$X — dado numérico mais relevante sobre gastos"
  },
  {
    "type": "investimentos",
    "emoji": "📈",
    "title": "Insight de Investimentos",
    "content": "Um insight profundo sobre a carteira, desempenho vs CDI, diversificação, ou progresso em direção à meta. 2-3 frases.",
    "highlight": "X% — dado numérico mais relevante sobre investimentos"
  },
  {
    "type": "ideia",
    "emoji": "💡",
    "title": "Ideia Fora da Caixa",
    "content": "Uma ideia criativa, inusitada ou pouco óbvia para acelerar a jornada financeira desta família. Pode ser sobre renda extra, otimização fiscal, arbitragem de oportunidades. 2-3 frases. Seja ousado.",
    "highlight": null
  }
]`
}

export async function generateDailyInsights(state: AppState): Promise<DailyInsights> {
  const today = new Date().toISOString().slice(0, 10)
  const prompt = buildPrompt(state)

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  )

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Gemini API error: ${response.status} — ${errBody.slice(0, 200)}`)
  }

  const data = await response.json()
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const raw: string = parts.find((p: any) => p.text && !p.thought)?.text
    ?? parts.find((p: any) => p.text)?.text
    ?? ''

  // remove markdown code fences e faz parse direto
  const clean = raw.replace(/```(?:json)?\s*/g, '').trim()
  if (!clean.startsWith('[')) throw new Error(`Formato inesperado: ${clean.slice(0, 80)}`)

  const slides: InsightSlide[] = JSON.parse(clean)

  return {
    date: today,
    slides,
    generatedAt: new Date().toISOString(),
  }
}
