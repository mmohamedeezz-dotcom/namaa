/**
 * حساب التسعير:
 * - card_usd: قيمة الكارت بالدولار اللي تكفي خصم يوتيوب بالجنيه + هامش تحويل الشبكة
 * - price_egp: اللي العميل يدفعه = تكلفة الدولار عليك * (1+هامشك) + رسوم ثابتة
 */
export function ceil2(n: number) { return Math.ceil(n * 100) / 100 }
export function ceil1(n: number) { return Math.ceil(n) }

export function cardUsdForYoutubeEgp(youtubeEgp: number, s: any): number {
  const usd = (youtubeEgp / Number(s.network_rate_egp)) * (1 + Number(s.fx_buffer_percent) / 100)
  return ceil2(usd)
}

export function priceEgpForCardUsd(cardUsd: number, s: any): number {
  const egp = cardUsd * Number(s.usd_rate_egp) * (1 + Number(s.margin_percent) / 100) + Number(s.fixed_fee_egp)
  return ceil1(egp)
}

export function quoteFromYoutubeEgp(youtubeEgp: number, s: any) {
  const card_usd = cardUsdForYoutubeEgp(youtubeEgp, s)
  const price_egp = priceEgpForCardUsd(card_usd, s)
  return { card_usd, price_egp }
}
