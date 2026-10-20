import { ArrowDownLeft, ArrowUpRight, ReceiptText, Truck, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { kinds, money } from '../lib/model'
import type { Entry } from '../lib/model'

// Key by category so adding a new financial kind requires its presentation too.
const presentation: Record<Entry['kind'], { icon: LucideIcon; color: string }> = {
  advance: { icon: ArrowUpRight, color: 'green' },
  expense: { icon: ReceiptText, color: 'blue' },
  repair: { icon: Wrench, color: 'orange' },
  deduction: { icon: ArrowDownLeft, color: 'purple' },
  replacement: { icon: Truck, color: 'blue' },
}

export function FinanceSummary({ entries }: { entries: Entry[] }) {
  return (
    <div className="stats-grid finance-stats">
      {(Object.keys(kinds) as Entry['kind'][]).map((kind) => {
        const amount = entries
          .filter((entry) => entry.kind === kind && entry.status === 'paid')
          .reduce((total, entry) => total + entry.amount, 0)
        const { icon: Icon, color } = presentation[kind]
        return (
          <div className="stat-card" key={kind}>
            <div className="stat-top">
              <span>{kinds[kind]}</span>
              <span className={`stat-icon ${color}`}>
                <Icon size={18} />
              </span>
            </div>
            <div className="stat-value">
              <span className="currency">฿</span>
              {money(amount)}
            </div>
            <small>เฉพาะรายการที่ดำเนินการแล้ว</small>
          </div>
        )
      })}
    </div>
  )
}
