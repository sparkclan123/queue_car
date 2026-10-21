import { describe, expect, it } from 'vitest'
import { queueStatus } from '../lib/model'
import type { QueueItem, QueueStatus } from '../lib/model'
import { validateQueueStatusChange } from '../lib/queue'

const item: QueueItem = {
  id: 'd1',
  driverId: 'd1',
  driverName: 'คนรถ',
  plate: '70-0001',
  truckType: '10 ล้อ',
  joinedAt: 1,
}
describe('pre-dispatch queue status', () => {
  it('treats legacy queues as waiting and allows going to pickup and back', () => {
    expect(queueStatus(item)).toBe('waiting')
    expect(() => validateQueueStatusChange(item, item, 'heading')).not.toThrow()
    const heading = { ...item, status: 'heading' as const }
    expect(queueStatus(heading)).toBe('heading')
    expect(() => validateQueueStatusChange(heading, heading, 'waiting')).not.toThrow()
  })
  it('rejects stale status changes after removal, rejoining or moving to the tail', () => {
    for (const current of [
      undefined,
      { ...item, joinedAt: 2 },
      { ...item, status: 'heading' as const },
    ]) {
      expect(() => validateQueueStatusChange(current, item, 'heading')).toThrow(
        'คิวหรือสถานะถูกเปลี่ยนไปแล้ว',
      )
    }
  })
  it('rejects duplicate and unsupported transitions', () => {
    expect(() => validateQueueStatusChange(item, item, 'waiting')).toThrow()
    expect(() => validateQueueStatusChange(item, item, 'running' as QueueStatus)).toThrow(
      'สถานะคิวไม่ถูกต้อง',
    )
  })
})
