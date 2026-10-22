import { describe, expect, it } from 'vitest'
import { MAX_EVIDENCE_DATA_URL_LENGTH, validateEvidence } from '../lib/evidence'
import type { Evidence } from '../lib/model'

const image = (id = 'image-1'): Evidence => ({
  id,
  name: 'receipt.jpg',
  dataUrl: 'data:image/jpeg;base64,/9j/AA==',
})
describe('financial evidence limits', () => {
  it('accepts up to ten independent images and no attachments', () => {
    expect(() => validateEvidence([])).not.toThrow()
    expect(() =>
      validateEvidence(Array.from({ length: 10 }, (_, i) => image(`image-${i}`))),
    ).not.toThrow()
    expect(() =>
      validateEvidence(Array.from({ length: 11 }, (_, i) => image(`image-${i}`))),
    ).toThrow('10 รูป')
  })
  it('rejects duplicate IDs, unsafe paths, non-JPEG data and oversize payloads before saving', () => {
    expect(() => validateEvidence([image(), image()])).toThrow()
    for (const value of [
      image('../bad'),
      { ...image(), name: '' },
      { ...image(), dataUrl: 'data:text/html;base64,AAAA' },
      { ...image(), dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(MAX_EVIDENCE_DATA_URL_LENGTH) },
    ])
      expect(() => validateEvidence([value])).toThrow()
  })
})
