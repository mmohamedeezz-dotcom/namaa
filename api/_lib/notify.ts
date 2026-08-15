/** إرسال إشعارات عبر ويبهوك n8n (واتساب/تيليجرام حسب الورك فلو عندك) */
export async function notify(type: string, payload: Record<string, any>) {
  const url = process.env.N8N_NOTIFY_WEBHOOK
  if (!url) return { sent: false, reason: 'N8N_NOTIFY_WEBHOOK not set' }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...payload, ts: new Date().toISOString() })
    })
    return { sent: r.ok, status: r.status }
  } catch (e: any) {
    return { sent: false, reason: e?.message }
  }
}
