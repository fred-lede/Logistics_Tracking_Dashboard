import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatsBar } from '../stats-bar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      allTracked: 'All Tracked',
      statusDelivered: 'Delivered',
      statusInTransit: 'In Transit',
      statusException: 'Exception',
      statusDelayed: 'Delayed',
    }
    return map[key] ?? key
  },
}))

const makePackages = (statuses: (string | null)[]) =>
  statuses.map((s, i) => ({ id: String(i), status: s }))

describe('StatsBar', () => {
  it('renders 5 stat cards', () => {
    render(<StatsBar packages={[]} activeFilter={null} onFilterChange={() => {}} />)
    expect(screen.getByText('All Tracked')).toBeTruthy()
    expect(screen.getByText('Delivered')).toBeTruthy()
    expect(screen.getByText('In Transit')).toBeTruthy()
    expect(screen.getByText('Exception')).toBeTruthy()
    expect(screen.getByText('Delayed')).toBeTruthy()
  })

  it('shows correct counts', () => {
    const packages = makePackages(['DELIVERED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION', null])
    render(<StatsBar packages={packages} activeFilter={null} onFilterChange={() => {}} />)
    const counts = screen.getAllByText(/^\d+$/)
    expect(counts).toHaveLength(5)
    expect(counts[0].textContent).toBe('5')
    expect(counts[1].textContent).toBe('2')
    expect(counts[2].textContent).toBe('1')
    expect(counts[3].textContent).toBe('1')
    expect(counts[4].textContent).toBe('0')
  })

  it('highlights active filter card', () => {
    render(<StatsBar packages={[]} activeFilter="delivered" onFilterChange={() => {}} />)
    const buttons = screen.getAllByRole('button')
    const deliveredBtn = buttons[1]
    expect(deliveredBtn.className).toContain('border-fedex-purple')
  })

  it('calls onFilterChange when clicking a card', () => {
    const onFilterChange = vi.fn()
    render(<StatsBar packages={[]} activeFilter={null} onFilterChange={onFilterChange} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1])
    expect(onFilterChange).toHaveBeenCalledWith('delivered')
  })

  it('clears filter when clicking active card', () => {
    const onFilterChange = vi.fn()
    render(<StatsBar packages={[]} activeFilter="delivered" onFilterChange={onFilterChange} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1])
    expect(onFilterChange).toHaveBeenCalledWith(null)
  })

  it('groups PICKUP_AVAILABLE with Delivered', () => {
    const packages = makePackages(['DELIVERED', 'PICKUP_AVAILABLE', 'IN_TRANSIT'])
    render(<StatsBar packages={packages} activeFilter={null} onFilterChange={() => {}} />)
    const counts = screen.getAllByText(/^\d+$/)
    expect(counts[1].textContent).toBe('2')
  })
})
