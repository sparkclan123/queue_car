export type Driver = {
  id: string
  name: string
  plate: string
  truckType: string
  phone: string
  active: boolean
  activeJobId: string
  createdAt: number
  updatedAt: number
}
export type QueueItem = {
  id: string
  driverId: string
  driverName: string
  plate: string
  truckType: string
  joinedAt: number
  // Queues saved before this field was introduced are treated as waiting.
  status?: QueueStatus
}
export type QueueStatus = 'waiting' | 'heading'
export const queueStates: Record<QueueStatus, string> = {
  waiting: 'รอคิว',
  heading: 'กำลังไปขึ้นงาน',
}
export function queueStatus(item: QueueItem): QueueStatus {
  return item.status ?? 'waiting'
}
export type Job = {
  id: string
  driverId: string
  driverName: string
  plate: string
  truckType: string
  date: string
  provinces: string[]
  status: 'scheduled' | 'running' | 'completed' | 'cancelled'
  note: string
  createdAt: number
  updatedAt: number
}
export type Entry = {
  id: string
  driverId: string
  driverName: string
  plate: string
  kind: 'advance' | 'expense' | 'repair' | 'deduction' | 'replacement'
  amount: number
  date: string
  recipient: string
  description: string
  status: 'pending' | 'paid' | 'void'
  evidenceCount: number
  createdAt: number
  updatedAt: number
  cancellationId?: string
}
export type Cancellation = {
  id: string
  driverId: string
  driverName: string
  plate: string
  date: string
  reason: string
  replacementDriverId: string
  replacementDriverName: string
  replacementPlate: string
  replacementJobId: string
  replacementJobDate: string
  replacementProvinces: string[]
  deductionAmount: number
  compensationAmount: number
  deductionEntryId: string
  compensationEntryId: string
  actor: string
  createdAt: number
}
export type CancellationInput = {
  reason: string
  replacementDriverId: string
  jobDate: string
  provinces: string[]
  deductionAmount: number
  compensationAmount: number
  deductionRecipient: string
}
export type Evidence = { id: string; name: string; dataUrl: string }
export type Audit = { id: string; action: string; detail: string; actor: string; createdAt: number }
export type Data = {
  drivers: Driver[]
  queue: QueueItem[]
  jobs: Job[]
  entries: Entry[]
  audits: Audit[]
  cancellations: Cancellation[]
}
export const kinds = {
  advance: 'เบิกเงิน',
  expense: 'ค่าใช้จ่าย',
  repair: 'ค่าซ่อมรถ',
  deduction: 'หักเงิน',
  replacement: 'ค่าขึ้นงานแทน',
}
export const jobStates = {
  scheduled: 'รอออกงาน',
  running: 'กำลังวิ่ง',
  completed: 'จบงานแล้ว',
  cancelled: 'ยกเลิก',
}
export const entryStates = { pending: 'รอดำเนินการ', paid: 'ดำเนินการแล้ว', void: 'ยกเลิก' }
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
export function dateLabel(date: string, full = false) {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: full ? 'long' : 'short',
    year: full ? 'numeric' : undefined,
    timeZone: 'Asia/Bangkok',
  }).format(new Date(`${date}T12:00:00+07:00`))
}
export function shiftDate(date: string, amount: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + amount)
  return d.toISOString().slice(0, 10)
}
export function money(satang: number) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: satang % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(satang / 100)
}
export function toSatang(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error('ระบุจำนวนเงินเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง')
  const n = Math.round(Number(value) * 100)
  if (!Number.isSafeInteger(n) || n <= 0 || n > 1000000000)
    throw new Error('จำนวนเงินต้องมากกว่า 0 และไม่เกิน 10,000,000 บาท')
  return n
}
export function optionalSatang(value: string) {
  if (!value.trim() || (/^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) === 0)) return 0
  return toSatang(value)
}
export const provinces =
  'กรุงเทพมหานคร กระบี่ กาญจนบุรี กาฬสินธุ์ กำแพงเพชร ขอนแก่น จันทบุรี ฉะเชิงเทรา ชลบุรี ชัยนาท ชัยภูมิ ชุมพร เชียงราย เชียงใหม่ ตรัง ตราด ตาก นครนายก นครปฐม นครพนม นครราชสีมา นครศรีธรรมราช นครสวรรค์ นนทบุรี นราธิวาส น่าน บึงกาฬ บุรีรัมย์ ปทุมธานี ประจวบคีรีขันธ์ ปราจีนบุรี ปัตตานี พระนครศรีอยุธยา พังงา พัทลุง พิจิตร พิษณุโลก เพชรบุรี เพชรบูรณ์ แพร่ พะเยา ภูเก็ต มหาสารคาม มุกดาหาร แม่ฮ่องสอน ยโสธร ยะลา ร้อยเอ็ด ระนอง ระยอง ราชบุรี ลพบุรี ลำปาง ลำพูน เลย ศรีสะเกษ สกลนคร สงขลา สตูล สมุทรปราการ สมุทรสงคราม สมุทรสาคร สระแก้ว สระบุรี สิงห์บุรี สุโขทัย สุพรรณบุรี สุราษฎร์ธานี สุรินทร์ หนองคาย หนองบัวลำภู อ่างทอง อุดรธานี อุทัยธานี อุตรดิตถ์ อุบลราชธานี อำนาจเจริญ'.split(
    ' ',
  )
export const emptyData: Data = {
  drivers: [],
  queue: [],
  jobs: [],
  entries: [],
  audits: [],
  cancellations: [],
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}
export function csvCell(value: unknown) {
  const v = String(value ?? '')
  return '"' + (/^[=+\-@\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""') + '"'
}
export function exportCsv(name: string, rows: unknown[][]) {
  const blob = new Blob(['\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
