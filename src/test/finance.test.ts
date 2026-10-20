import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FinanceSummary } from '../components/FinanceSummary'
import { kinds } from '../lib/model'
import type { Entry } from '../lib/model'

describe('finance page summary', () => {
  it('renders every category, including replacement, with an empty ledger', () => {
    const html = renderToStaticMarkup(createElement(FinanceSummary, { entries: [] }))
    for (const label of Object.values(kinds)) expect(html).toContain(label)
    expect(html.match(/<svg /g)).toHaveLength(Object.keys(kinds).length)
    expect(html).not.toContain('undefined')
  })

  it('includes completed replacement compensation and excludes pending or void amounts', () => {
    const entry: Entry = {
      id: 'replacement-paid',
      driverId: 'driver-1',
      driverName: 'คนขึ้นงานแทน',
      plate: '70-0001',
      kind: 'replacement',
      amount: 30050,
      date: '2026-10-20',
      recipient: 'คนขึ้นงานแทน',
      description: 'ค่าขึ้นงานแทน',
      status: 'paid',
      evidenceCount: 0,
      createdAt: 1,
      updatedAt: 1,
      cancellationId: 'cancellation-1',
    }
    const html = renderToStaticMarkup(
      createElement(FinanceSummary, {
        entries: [
          entry,
          { ...entry, id: 'pending', status: 'pending', amount: 50000 },
          { ...entry, id: 'void', status: 'void', amount: 70000 },
        ],
      }),
    )
    expect(html).toContain('300.50')
    expect(html).not.toContain('500')
    expect(html).not.toContain('700')
    expect(html).not.toContain('1,500.50')
  })
})
