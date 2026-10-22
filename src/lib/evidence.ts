import type { Evidence } from './model'

export const MAX_EVIDENCE_IMAGES = 10
export const MAX_EVIDENCE_DATA_URL_LENGTH = 270000
export type PreparedEvidence = Evidence & { originalBytes: number; compressedBytes: number }

export function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function validateEvidence(images: Evidence[]) {
  if (images.length > MAX_EVIDENCE_IMAGES)
    throw new Error(`แนบได้ไม่เกิน ${MAX_EVIDENCE_IMAGES} รูป`)
  if (new Set(images.map((image) => image.id)).size !== images.length)
    throw new Error('มีรูปหลักฐานซ้ำ กรุณาเลือกใหม่')
  for (const image of images) {
    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(image.id) ||
      !image.name ||
      image.name.length > 120 ||
      image.dataUrl.length > MAX_EVIDENCE_DATA_URL_LENGTH ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl)
    )
      throw new Error('รูปหลักฐานไม่ถูกต้องหรือมีขนาดใหญ่เกินไป กรุณาเลือกรูปใหม่')
  }
}

function jpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('ไม่สามารถบีบอัดรูปนี้ได้'))),
      'image/jpeg',
      quality,
    ),
  )
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านรูปที่ย่อแล้วได้'))
    reader.readAsDataURL(blob)
  })
}

export async function compressEvidence(file: File): Promise<PreparedEvidence> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('เลือกภาพ JPG, PNG หรือ WebP เท่านั้น')
  if (file.size > 15 * 1024 * 1024) throw new Error('ภาพต้นฉบับต้องไม่เกิน 15 MB')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('เปิดรูปนี้ไม่ได้ กรุณาเลือกไฟล์รูปอื่น')
  }
  try {
    const canvas = document.createElement('canvas')
    let max = 1600
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('อุปกรณ์นี้ไม่รองรับการเตรียมรูปภาพ')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      // Preserve receipt text resolution before reducing the dimensions further.
      for (const quality of [0.8, 0.7, 0.6]) {
        const blob = await jpegBlob(canvas, quality)
        if (23 + 4 * Math.ceil(blob.size / 3) > MAX_EVIDENCE_DATA_URL_LENGTH) continue
        return {
          id: crypto.randomUUID(),
          name: (file.name.replace(/\.[^.]+$/, '').slice(0, 110) || 'หลักฐาน') + '.jpg',
          dataUrl: await asDataUrl(blob),
          originalBytes: file.size,
          compressedBytes: blob.size,
        }
      }
      max = Math.round(max * 0.8)
    }
    throw new Error('ภาพนี้ใหญ่เกินไป กรุณาใช้ภาพที่เล็กลง')
  } finally {
    bitmap.close()
  }
}
