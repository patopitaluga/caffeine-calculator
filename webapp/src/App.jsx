import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const START_HOUR = 6
const END_HOUR = 30
const DEFAULT_HALF_LIFE_HOURS = 5
const ABSORPTION_RATE = 5
const MATE_ROUND_DURATION_HOURS = 1
const MATE_CEBADA_VOLUME_ML = 150
// Conservative default within reported yerba-mate infusion values of about 42–82 mg per 150 ml.
const MATE_CAFFEINE_PER_CEBADA_MG = 50
const BEVERAGE_STORAGE_KEY = 'mateplan:beverage'
const BEDTIME_STORAGE_KEY = 'mateplan:bedtime'
const HALF_LIFE_STORAGE_KEY = 'mateplan:half-life-hours'
const DEFAULT_BEDTIME = 23
const BEVERAGES = {
  mate: { label: 'Mate' },
  coffee: { label: 'Café', amount: 95 },
  tea: { label: 'Té', amount: 40 },
}

const plot = { left: 64, right: 936, top: 100, bottom: 500 }
const baseCaffeineScale = 180
const chartWidth = plot.right - plot.left
const chartHeight = plot.bottom - plot.top

function getInitialBeverage() {
  if (typeof window === 'undefined') return 'mate'

  try {
    const savedBeverage = window.localStorage.getItem(BEVERAGE_STORAGE_KEY)
    return Object.hasOwn(BEVERAGES, savedBeverage) ? savedBeverage : 'mate'
  } catch {
    return 'mate'
  }
}

function getInitialBedtime() {
  if (typeof window === 'undefined') return DEFAULT_BEDTIME

  try {
    const savedBedtime = Number(window.localStorage.getItem(BEDTIME_STORAGE_KEY))
    return Number.isFinite(savedBedtime) && savedBedtime >= START_HOUR && savedBedtime <= END_HOUR
      ? savedBedtime
      : DEFAULT_BEDTIME
  } catch {
    return DEFAULT_BEDTIME
  }
}

function getInitialHalfLife() {
  if (typeof window === 'undefined') return DEFAULT_HALF_LIFE_HOURS

  try {
    const savedHalfLife = Number(window.localStorage.getItem(HALF_LIFE_STORAGE_KEY))
    return [4, 5, 6].includes(savedHalfLife) ? savedHalfLife : DEFAULT_HALF_LIFE_HOURS
  } catch {
    return DEFAULT_HALF_LIFE_HOURS
  }
}

function caffeineFromDose(dose, time, halfLifeHours) {
  const elapsed = time - dose.time
  if (elapsed <= 0) return 0

  const absorbed = 1 - Math.exp(-ABSORPTION_RATE * elapsed)
  const remaining = Math.exp((-Math.LN2 / halfLifeHours) * elapsed)
  return dose.amount * absorbed * remaining
}

function dosesForIntake(intake) {
  if (intake.beverage !== 'mate') return [intake]

  const servings = Math.max(1, intake.servings ?? 8)
  return Array.from({ length: servings }, (_, index) => ({
    time: intake.time + (index / Math.max(1, servings - 1)) * MATE_ROUND_DURATION_HOURS,
    amount: intake.amount / servings,
  }))
}

function caffeineFromIntake(intake, time, halfLifeHours) {
  return dosesForIntake(intake).reduce((total, dose) => total + caffeineFromDose(dose, time, halfLifeHours), 0)
}

function clampIntakeTime(time, beverage) {
  const lastStart = beverage === 'mate'
    ? END_HOUR - MATE_ROUND_DURATION_HOURS
    : END_HOUR
  return Math.min(lastStart, Math.max(START_HOUR, time))
}

function getCaffeineAt(time, containers, halfLifeHours) {
  return containers.reduce((total, container) => total + caffeineFromIntake(container, time, halfLifeHours), 0)
}

function hourLabel(hour) {
  const normalized = ((hour % 24) + 24) % 24
  return String(normalized).padStart(2, '0')
}

function formatTime(hour) {
  const minutes = Math.round((hour % 1) * 60)
  return `${hourLabel(Math.floor(hour))}:${String(minutes).padStart(2, '0')}`
}

function xForTime(hour) {
  return plot.left + ((hour - START_HOUR) / (END_HOUR - START_HOUR)) * chartWidth
}

function yForAmount(amount, scale = baseCaffeineScale) {
  return plot.bottom - (amount / scale) * chartHeight
}

function App() {
  const [containers, setContainers] = useState([])
  const [activeContainerId, setActiveContainerId] = useState(null)
  const [bedtime, setBedtime] = useState(getInitialBedtime)
  const [isBedtimeDragging, setIsBedtimeDragging] = useState(false)
  const [beverage, setBeverage] = useState(getInitialBeverage)
  const [halfLifeHours, setHalfLifeHours] = useState(getInitialHalfLife)
  const [mateServings, setMateServings] = useState(8)
  const nextContainerId = useRef(0)

  useEffect(() => {
    try {
      window.localStorage.setItem(BEVERAGE_STORAGE_KEY, beverage)
    } catch {
      // Keep the selector usable when browser storage is unavailable.
    }
  }, [beverage])

  useEffect(() => {
    try {
      window.localStorage.setItem(BEDTIME_STORAGE_KEY, String(bedtime))
    } catch {
      // Keep bedtime adjustable when browser storage is unavailable.
    }
  }, [bedtime])

  useEffect(() => {
    try {
      window.localStorage.setItem(HALF_LIFE_STORAGE_KEY, String(halfLifeHours))
    } catch {
      // Keep the model usable when browser storage is unavailable.
    }
  }, [halfLifeHours])

  const chart = useMemo(() => {
    const sampleCount = 240
    const samples = Array.from({ length: sampleCount + 1 }, (_, index) => {
      const time = START_HOUR + (index / sampleCount) * (END_HOUR - START_HOUR)
      const total = containers.reduce((sum, container) => sum + caffeineFromIntake(container, time, halfLifeHours), 0)
      return { time, total }
    })

    let peak = { time: START_HOUR, amount: 0 }
    for (const sample of samples) {
      if (sample.total > peak.amount) peak = { time: sample.time, amount: sample.total }
    }

    const scale = Math.max(baseCaffeineScale, Math.ceil(peak.amount / 30) * 30)
    const activeContainer = containers.find((container) => container.id === activeContainerId)
    const dots = []
    const columns = 111
    for (let column = 0; column <= columns; column += 1) {
      const time = START_HOUR + (column / columns) * (END_HOUR - START_HOUR)
      const total = containers.reduce((sum, container) => sum + caffeineFromIntake(container, time, halfLifeHours), 0)
      if (total === 0) continue
      const simulated = activeContainer ? caffeineFromIntake(activeContainer, time, halfLifeHours) : 0
      for (let row = 0; row <= scale / 6; row += 1) {
        const amount = row * 6
        if (amount > total) continue
        const isSimulated = simulated > 0 && amount > total - simulated
        const fade = Math.max(0.16, 0.72 - (total - amount) / 160)
        dots.push({
          x: plot.left + (column / columns) * chartWidth,
          y: yForAmount(amount, scale),
          key: `${column}-${row}`,
          opacity: isSimulated ? fade : fade * 0.88,
          color: isSimulated ? '#348cff' : '#dedede',
        })
      }
    }

    return {
      dots,
      peak,
      samples,
      bedtime: getCaffeineAt(bedtime, containers, halfLifeHours),
      scale,
      total: containers.reduce((sum, container) => sum + container.amount, 0),
    }
  }, [activeContainerId, bedtime, containers, halfLifeHours])

  function timeFromPointer(event) {
    const svg = event.currentTarget.ownerSVGElement
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const chartPoint = point.matrixTransform(svg.getScreenCTM().inverse())
    const ratio = Math.min(1, Math.max(0, (chartPoint.x - plot.left) / chartWidth))
    const rawTime = START_HOUR + ratio * (END_HOUR - START_HOUR)
    return {
      time: Math.round(rawTime * 4) / 4,
      x: chartPoint.x,
      y: chartPoint.y,
    }
  }

  function startPointerSelection(event) {
    if (event.button !== 0) return
    const position = timeFromPointer(event)
    const clickedContainer = containers.find(
      (container) => Math.abs(xForTime(container.time) - position.x) < 16
        && Math.abs(plot.bottom + 34 - position.y) < 16,
    )

    if (clickedContainer) {
      setContainers((currentContainers) => currentContainers.filter((container) => container.id !== clickedContainer.id))
      return
    }

    const container = {
      id: nextContainerId.current++,
      time: clampIntakeTime(position.time, beverage),
      beverage,
      amount: beverage === 'mate'
        ? mateServings * MATE_CAFFEINE_PER_CEBADA_MG
        : BEVERAGES[beverage].amount,
      ...(beverage === 'mate' ? { servings: mateServings } : {}),
    }
    setContainers((currentContainers) => [...currentContainers, container])
    setActiveContainerId(container.id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function dragSelection(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || activeContainerId === null) return
    const { time: pointerTime } = timeFromPointer(event)
    const activeContainer = containers.find((container) => container.id === activeContainerId)
    const time = clampIntakeTime(pointerTime, activeContainer?.beverage)
    setContainers((currentContainers) => currentContainers.map((container) => (
      container.id === activeContainerId ? { ...container, time } : container
    )))
  }

  function endPointerSelection() {
    setActiveContainerId(null)
    setIsBedtimeDragging(false)
  }

  function startBedtimeDrag(event) {
    event.currentTarget.setPointerCapture(event.pointerId)
    setActiveContainerId(null)
    setIsBedtimeDragging(true)
    setBedtime(timeFromPointer(event).time)
  }

  function dragBedtime(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    setBedtime(timeFromPointer(event).time)
  }

  function moveBedtime(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 0.25 : -0.25
    setBedtime((time) => Math.min(END_HOUR, Math.max(START_HOUR, time + direction)))
  }

  function moveSelection(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    if (containers.length === 0) return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 0.25 : -0.25
    const lastContainer = containers[containers.length - 1]
    const lastContainerId = lastContainer.id
    setContainers((currentContainers) => currentContainers.map((container) => (
      container.id === lastContainerId
        ? { ...container, time: clampIntakeTime(container.time + direction, container.beverage) }
        : container
    )))
  }

  const peakX = xForTime(chart.peak.time)
  const bedtimeX = xForTime(bedtime)
  const y50 = yForAmount(50, chart.scale)
  const tickHours = [6, 9, 12, 15, 18, 21, 24, 27, 30]
  const labels = [6, 12, 18, 24, 30]
  const servingName = beverage === 'mate' ? 'ronda' : 'taza'
  const servingNamePlural = beverage === 'mate' ? 'rondas' : 'tazas'
  const servingArticle = 'una'
  const mateRoundVolume = new Intl.NumberFormat('es-AR').format(mateServings * MATE_CEBADA_VOLUME_ML)
  const cupsCount = containers.filter((container) => container.beverage !== 'mate').length
  const mateRoundsCount = containers.length - cupsCount
  const servingSummary = []
  if (cupsCount > 0) servingSummary.push(`${cupsCount} ${cupsCount === 1 ? 'TAZA' : 'TAZAS'}`)
  if (mateRoundsCount > 0) servingSummary.push(`${mateRoundsCount} ${mateRoundsCount === 1 ? 'RONDA' : 'RONDAS'}`)
  if (servingSummary.length === 0) servingSummary.push(`0 ${servingNamePlural.toUpperCase()}`)

  return (
    <main className="dashboard">
      <header className="summary" aria-label="Resumen de cafeína">
        <h1>Calculadora de cafeína en el cuerpo</h1>
        <div className="beverage-picker">
          <label htmlFor="beverage">Bebida</label>
          <select id="beverage" value={beverage} onChange={(event) => setBeverage(event.target.value)}>
            {Object.entries(BEVERAGES).map(([value, option]) => (
              <option key={value} value={value}>{option.label}</option>
            ))}
          </select>
          {beverage === 'mate' ? (
            <>
              <div className="beverage-setting">
                <label htmlFor="mate-servings">Cebadas</label>
                <select
                  id="mate-servings"
                  value={mateServings}
                  onChange={(event) => setMateServings(Number(event.target.value))}
                >
                  {[6, 8, 10].map((servings) => (
                    <option key={servings} value={servings}>{servings}</option>
                  ))}
                </select>
              </div>
              <span className="beverage-dose">
                {MATE_CAFFEINE_PER_CEBADA_MG}mg aprox./cebada (150ml) · {mateRoundVolume}ml · {mateServings * MATE_CAFFEINE_PER_CEBADA_MG}mg/ronda · 1hs.
              </span>
            </>
          ) : (
            <span className="beverage-dose">{BEVERAGES[beverage].amount}mg aprox. por taza</span>
          )}
        </div>
        <div className="beverage-legend" aria-label="Colores de las bebidas">
          <div className="legend-item"><span className="legend-swatch" data-beverage="coffee" />Café</div>
          <div className="legend-item"><span className="legend-swatch" data-beverage="mate" />Mate</div>
          <div className="legend-item"><span className="legend-swatch" data-beverage="tea" />Té</div>
        </div>
        <p>
          {servingSummary.join(' + ')} <span className="summary-separator">·</span> {chart.total}mg <span className="summary-separator">·</span>
          <span className="half-life-control">
            <span>CADA</span>
            <span className="half-life-value">
              <select
                id="half-life-hours"
                value={halfLifeHours}
                aria-label="Horas para que la cafeína se reduzca a la mitad"
                onChange={(event) => setHalfLifeHours(Number(event.target.value))}
              >
                {[4, 5, 6].map((hours) => (
                  <option key={hours} value={hours}>{hours}</option>
                ))}
              </select>
              <span>hs.</span>
            </span>
            <span>QUEDA LA MITAD</span>
          </span>
        </p>
      </header>

      <section className="timeline" aria-label="Evolución del nivel de cafeína">
        <svg
          className="chart"
          viewBox="0 0 1000 650"
          role="img"
          aria-labelledby="chart-title chart-description"
        >
          <title id="chart-title">Nivel estimado de cafeína restante en el cuerpo</title>
          <desc id="chart-description">
            {containers.length} {containers.length === 1 ? 'bebida simulada' : 'bebidas simuladas'}.{' '}
            {beverage === 'mate' && `La nueva ronda estima ${mateServings * MATE_CAFFEINE_PER_CEBADA_MG}mg en ${mateServings} cebadas repartidas durante una hora. `}
            Haz clic en la línea de tiempo para añadir
            una bebida, arrastra un marcador nuevo para ubicarlo o haz clic en un marcador para eliminarlo. Arrastra la línea de dormir para ajustar la hora.
          </desc>

          <g className="background-dots" aria-hidden="true">
            {Array.from({ length: 112 }, (_, column) =>
              Array.from({ length: 33 }, (_, row) => (
                <circle
                  key={`grid-${column}-${row}`}
                  cx={plot.left + (column / 111) * chartWidth}
                  cy={plot.top + row * 12.5}
                  r="1.15"
                />
              )),
            )}
          </g>

          <g className="level-dots" aria-hidden="true">
            {chart.dots.map((dot) => (
              <circle
                key={dot.key}
                cx={dot.x}
                cy={dot.y}
                r="2.65"
                fill={dot.color}
                opacity={dot.opacity}
              />
            ))}
          </g>

          <line className="reference-line" x1={plot.left} x2={plot.right} y1={y50} y2={y50} />
          <text className="reference-label" x={plot.right + 12} y={y50 + 6}>50mg</text>

          {containers.length > 0 && (
            <>
              <g className="annotation peak-annotation">
                <line x1={peakX} x2={peakX} y1="80" y2={yForAmount(chart.peak.amount, chart.scale) - 12} />
                <text x={peakX + 12} y="55">PICO {Math.round(chart.peak.amount)}mg</text>
                <text className="annotation-muted" x={peakX + 12} y="79">{formatTime(chart.peak.time)}</text>
              </g>

              <g className={`annotation bedtime-marker${isBedtimeDragging ? ' is-active' : ''}`}>
                <line x1={bedtimeX} x2={bedtimeX} y1="80" y2={plot.bottom - 10} />
                <rect className="bedtime-handle" x={bedtimeX - 8} y={plot.top - 3} width="16" height="6" rx="2" />
                <text x={bedtimeX + 12} y="55">A DORMIR {formatTime(bedtime)}</text>
                <text x={bedtimeX + 12} y="79">{Math.round(chart.bedtime)}mg EN TU CUERPO</text>
              </g>
            </>
          )}

          <line className="axis" x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
          {tickHours.map((hour) => {
            const x = xForTime(hour)
            return (
              <line key={hour} className="tick" x1={x} x2={x} y1={plot.bottom} y2={plot.bottom + 8} />
            )
          })}
          {labels.map((hour) => (
            <text
              key={hour}
              className="time-label"
              x={xForTime(hour)}
              y={plot.bottom + 74}
              textAnchor={hour === 6 ? 'start' : hour === 30 ? 'end' : 'middle'}
            >
              {hour % 24}hs.
            </text>
          ))}

          {containers.map((container) => {
            const x = xForTime(container.time)
            const active = container.id === activeContainerId
            return (
              <g
                key={container.id}
                className={`intake-marker${active ? ' selected-marker is-active' : ''}`}
                data-beverage={container.beverage}
                aria-hidden="true"
              >
                <line x1={x} x2={x} y1={y50} y2={plot.bottom + 23} />
                {active && <circle className="active-halo" cx={x} cy={plot.bottom + 34} r="13" />}
                <circle className="marker-center" cx={x} cy={plot.bottom + 34} r="8.5" />
                <circle className="marker-ring" cx={x} cy={plot.bottom + 34} r="8.5" />
                {active && <text x={x} y={plot.bottom + 64} textAnchor="middle">{formatTime(container.time)}</text>}
              </g>
            )
          })}

          <rect
            className="chart-hit-area"
            x={plot.left}
            y={plot.top}
            width={chartWidth}
            height={chartHeight + 42}
            role="slider"
            tabIndex="0"
            aria-label={`Línea de tiempo de cafeína. Usa las flechas para mover la última bebida; haz clic para añadir ${servingArticle} ${servingName} o sobre un marcador para eliminarlo.`}
            aria-valuemin={START_HOUR * 60}
            aria-valuemax={END_HOUR * 60}
            aria-valuenow={Math.round((containers[containers.length - 1]?.time ?? START_HOUR) * 60)}
            aria-valuetext={containers.length > 0 ? formatTime(containers[containers.length - 1].time) : `Sin ${servingNamePlural} añadidas`}
            onPointerDown={startPointerSelection}
            onPointerMove={dragSelection}
            onPointerUp={endPointerSelection}
            onPointerCancel={endPointerSelection}
            onLostPointerCapture={endPointerSelection}
            onKeyDown={moveSelection}
          />
          <rect
            className="bedtime-hit-area"
            x={bedtimeX - 12}
            y={plot.top}
            width="24"
            height={plot.bottom - plot.top - 10}
            role="slider"
            tabIndex="0"
            aria-label="Hora de dormir. Arrastra la línea o usa las flechas para cambiarla."
            aria-valuemin={START_HOUR * 60}
            aria-valuemax={END_HOUR * 60}
            aria-valuenow={Math.round(bedtime * 60)}
            aria-valuetext={formatTime(bedtime)}
            onPointerDown={startBedtimeDrag}
            onPointerMove={dragBedtime}
            onPointerUp={endPointerSelection}
            onPointerCancel={endPointerSelection}
            onLostPointerCapture={endPointerSelection}
            onKeyDown={moveBedtime}
          />
        </svg>
        <p className="hint">HAZ CLIC PARA AÑADIR {servingArticle.toUpperCase()} {servingName.toUpperCase()} · ARRASTRA PARA MOVER · HAZ CLIC EN EL MARCADOR PARA ELIMINAR · ARRASTRA LA LÍNEA DE DORMIR</p>
      </section>
    </main>
  )
}

export default App
