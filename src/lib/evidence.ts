import type { Evidence } from './model'
export async function compressEvidence(file: File): Promise<Evidence> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('เลือกภาพ JPG, PNG หรือ WebP เท่านั้น')
  if (file.size > 15 * 1024 * 1024) throw new Error('ภาพต้นฉบับต้องไม่เกิน 15 MB')
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    let max = 1600
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('อุปกรณ์นี้ไม่รองรับการเตรียมรูปภาพ')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.78 - attempt * 0.07)
      if (dataUrl.length <= 600000)
        return {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 110) + '.jpg',
          dataUrl,
        }
      max = Math.round(max * 0.8)
    }
    throw new Error('ภาพนี้ใหญ่เกินไป กรุณาใช้ภาพที่เล็กลง')
  } finally {
    bitmap.close()
  }
}
