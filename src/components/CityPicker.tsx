import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, MapPin, Search } from 'lucide-react'
import { CITY_DIRECTORY } from '../data/cityBenchmarks'

/**
 * 紧凑的可搜索城市选择器，替代 30 项的原生长下拉。
 * 交互与无障碍要求见 docs/CITY_PICKER_UX.md：收起只占一行，展开后
 * 提供搜索 + 地区分组，分组只作视觉导航，不写入选中值。
 */

const NATIONAL_CODE = 'national'
const NATIONAL_NAME = '全国'
/** 地区展示顺序；数据里出现但不在表内的地区会追加到末尾。 */
const REGION_ORDER = ['华北', '华东', '华中', '华南', '西南', '西北', '东北']

type CityOption = { cityCode: string; cityName: string }

interface CityPickerProps {
  value: string
  onChange: (cityCode: string) => void
  /** 外部可见 label 的 id，用于 aria-labelledby。 */
  labelId?: string
}

function sortRegions(regions: string[]): string[] {
  return [...regions].sort((a, b) => {
    const indexA = REGION_ORDER.indexOf(a)
    const indexB = REGION_ORDER.indexOf(b)
    if (indexA === -1 && indexB === -1) return a.localeCompare(b, 'zh-CN')
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })
}

export const CityPicker: React.FC<CityPickerProps> = ({ value, onChange, labelId }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedName = value === NATIONAL_CODE
    ? NATIONAL_NAME
    : CITY_DIRECTORY.find((city) => city.cityCode === value)?.cityName ?? NATIONAL_NAME

  const { groups, flatOptions } = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const matches = (option: CityOption) =>
      !keyword
      || option.cityName.toLowerCase().includes(keyword)
      || option.cityCode.toLowerCase().includes(keyword)

    const national: CityOption = { cityCode: NATIONAL_CODE, cityName: NATIONAL_NAME }
    const showNational = matches(national)

    const cities = CITY_DIRECTORY.filter((city) => matches(city))
    const byRegion = new Map<string, CityOption[]>()
    for (const city of cities) {
      const bucket = byRegion.get(city.region)
      if (bucket) bucket.push(city)
      else byRegion.set(city.region, [city])
    }

    const orderedGroups = sortRegions([...byRegion.keys()]).map((region) => ({
      region,
      cities: byRegion.get(region) ?? [],
    }))

    return {
      groups: orderedGroups,
      // 键盘上下键在这个扁平序列上移动，顺序与视觉顺序一致。
      flatOptions: [...(showNational ? [national] : []), ...orderedGroups.flatMap((group) => group.cities)],
    }
  }, [query])

  const showNationalRow = flatOptions.some((option) => option.cityCode === NATIONAL_CODE)

  const close = (restoreFocus: boolean) => {
    setIsOpen(false)
    setQuery('')
    if (restoreFocus) triggerRef.current?.focus()
  }

  const open = () => {
    setIsOpen(true)
    setQuery('')
    const index = Math.max(0, flatOptions.findIndex((option) => option.cityCode === value))
    setActiveIndex(index)
  }

  const select = (cityCode: string) => {
    onChange(cityCode)
    close(true)
  }

  useEffect(() => {
    if (!isOpen) return
    inputRef.current?.focus()
  }, [isOpen])

  // 过滤后原来的高亮项可能已不存在，收敛回列表内。
  useEffect(() => {
    setActiveIndex((current) => (current >= flatOptions.length ? 0 : current))
  }, [flatOptions.length])

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen])

  const handlePanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!flatOptions.length) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + step + flatOptions.length) % flatOptions.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const option = flatOptions[activeIndex]
      if (option) select(option.cityCode)
    }
  }

  const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }

  const optionId = (cityCode: string) => `city-option-${cityCode}`
  const activeOption = flatOptions[activeIndex]

  const renderOption = (option: CityOption) => {
    const isSelected = option.cityCode === value
    const isActive = activeOption?.cityCode === option.cityCode
    return (
      <button
        key={option.cityCode}
        id={optionId(option.cityCode)}
        type="button"
        role="option"
        aria-selected={isSelected}
        data-active={isActive}
        className={`city-option ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
        onClick={() => select(option.cityCode)}
        onMouseEnter={() => setActiveIndex(flatOptions.findIndex((item) => item.cityCode === option.cityCode))}
        tabIndex={-1}
      >
        {option.cityName}
      </button>
    )
  }

  return (
    <div className="city-picker" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="city-picker-listbox"
        aria-haspopup="listbox"
        aria-labelledby={labelId}
        className="city-picker-trigger"
        onClick={() => (isOpen ? close(false) : open())}
        onKeyDown={handleTriggerKeyDown}
      >
        <MapPin size={14} aria-hidden="true" />
        <span className="city-picker-value">{selectedName}</span>
        <ChevronDown size={15} aria-hidden="true" className={`city-picker-caret ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="city-picker-panel" onKeyDown={handlePanelKeyDown}>
          <div className="city-picker-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              className="city-picker-search-input"
              placeholder="搜索城市"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
              aria-label="搜索城市"
              aria-controls="city-picker-listbox"
              aria-activedescendant={activeOption ? optionId(activeOption.cityCode) : undefined}
              autoComplete="off"
            />
          </div>

          <div className="city-picker-list" id="city-picker-listbox" role="listbox" ref={listRef}>
            {flatOptions.length === 0 && <p className="city-picker-empty">没有匹配的城市。</p>}

            {showNationalRow && (
              <div className="city-picker-group">
                <div className="city-picker-options">
                  {renderOption({ cityCode: NATIONAL_CODE, cityName: NATIONAL_NAME })}
                </div>
              </div>
            )}

            {groups.map((group) => (
              <div className="city-picker-group" key={group.region}>
                <p className="city-picker-group-title" aria-hidden="true">{group.region}</p>
                <div className="city-picker-options">{group.cities.map(renderOption)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
