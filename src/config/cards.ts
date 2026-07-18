// Fonte única de verdade dos cartões de crédito da família. Adicionar/remover um cartão
// só exige mexer aqui — o resto do app (tipos, cálculo de fatura, formulários, telas) lê
// desta lista em vez de assumir nomes fixos.
export const CARDS = [
  { id: 'itau', label: 'Itaú', closingDay: 10, dueDay: 17 },
  { id: 'visablack', label: 'Visa Black', closingDay: 1, dueDay: 11 },
  { id: 'mana', label: 'Mana', closingDay: 8, dueDay: 15 },
] as const

export type CardId = typeof CARDS[number]['id']

export function cardConfig(card: CardId) {
  return CARDS.find((c) => c.id === card)!
}
