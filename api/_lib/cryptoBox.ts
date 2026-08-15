import crypto from 'crypto'

function key(): Buffer {
  const hex = process.env.CARD_ENC_KEY || ''
  if (hex.length !== 64) throw new Error('CARD_ENC_KEY لازم يكون 64 حرف hex (32 بايت)')
  return Buffer.from(hex, 'hex')
}

export function encryptJson(obj: any): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const pt = Buffer.from(JSON.stringify(obj), 'utf8')
  const ct = Buffer.concat([cipher.update(pt), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.')
}

export function decryptJson(blob: string): any {
  const [ivB, tagB, ctB] = blob.split('.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB, 'base64'))
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()])
  return JSON.parse(pt.toString('utf8'))
}

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

export function hmac256(secret: string, s: string): string {
  return crypto.createHmac('sha256', secret).update(s).digest('hex')
}

export function randomOtp(): string {
  return String(crypto.randomInt(100000, 999999))
}

export function randomCode(prefix = 'NV'): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += abc[crypto.randomInt(0, abc.length)]
  return prefix + '-' + s
}
