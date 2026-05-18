import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer | null {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) return null
  const buf = Buffer.from(keyHex, 'hex')
  return buf.length === 32 ? buf : null
}

// TODO: Set ENCRYPTION_KEY to a 32-byte hex string (64 hex chars) in .env.local
// for AES-256-GCM encryption. Until then, tokens are base64-encoded (isolated
// server-side only — never sent to the client).

export function encrypt(plaintext: string): string {
  const key = getKey()
  if (!key) {
    return 'b64:' + Buffer.from(plaintext).toString('base64')
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ''
  if (ciphertext.startsWith('b64:')) {
    return Buffer.from(ciphertext.slice(4), 'base64').toString('utf-8')
  }
  if (!ciphertext.startsWith('enc:')) {
    return ciphertext
  }
  const key = getKey()
  if (!key) throw new Error('ENCRYPTION_KEY required to decrypt enc: tokens')
  const parts = ciphertext.split(':')
  const iv = Buffer.from(parts[1], 'hex')
  const tag = Buffer.from(parts[2], 'hex')
  const encrypted = Buffer.from(parts[3], 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted).toString('utf-8') + decipher.final('utf-8')
}
