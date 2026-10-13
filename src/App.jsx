import { useEffect, useState } from 'react'
import './App.css'

/* ---------- constants & demo rules ---------- */
const NAV = ['Dashboard', 'Patient Queue', 'Register Patient', 'Review Tasks', 'Audit Trail']
const STAFF = 'Nurse Anita'
const LEVELS = ['Immediate', 'Soon', 'Routine']
const RANK = { Routine: 0, Soon: 1, Immediate: 2 }
const ORDER = { Waiting: 0, 'In consultation': 1, Done: 2 }
const REASONS = ['Clinical judgement', 'Re-measured vitals', 'Additional history from patient', 'Caregiver concern', 'Other (noted in chart)']
const VITALS = [['temp', 'Temperature', '°C'], ['hr', 'Pulse', 'bpm'], ['spo2', 'SpO₂', '%'], ['sys', 'Systolic BP', 'mmHg']]
const RED = ['chest pain', 'breathing', 'breathless', 'wheez', 'unconscious', 'seizure', 'stroke', 'severe bleeding']
const AMBER = ['fever', 'vomit', 'dizz', 'nausea', 'fracture', 'abdominal', 'severe']
const WAIT_LIMIT = 45 // minutes before an operational review task is created

const uid = () => Math.random().toString(36).slice(2, 9)
const ago = m => Date.now() - m * 60000
const num = v => (v === '' || v == null ? null : Number(v))
const hhmm = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// Illustrative, deterministic rules only. Never invents missing vitals.
function triage(p) {
  let level = 'Routine'
  const why = []
  const up = (l, msg) => { if (RANK[l] > RANK[level]) level = l; why.push(msg) }
  const s = p.symptoms.toLowerCase()
  if (RED.some(k => s.includes(k))) up('Immediate', 'Red-flag symptom reported')
  else if (AMBER.some(k => s.includes(k))) up('Soon', 'Symptom warrants timely review')
  const v = Object.fromEntries(VITALS.map(([k]) => [k, num(p.vitals[k])]))
  if (v.spo2 != null) { if (v.spo2 < 92) up('Immediate', `SpO₂ ${v.spo2}% is below 92%`); else if (v.spo2 < 95) up('Soon', `SpO₂ ${v.spo2}% is below 95%`) }
  if (v.temp != null) { if (v.temp >= 39.5) up('Immediate', `Temperature ${v.temp}°C is 39.5 or higher`); else if (v.temp >= 38) up('Soon', `Temperature ${v.temp}°C is 38 or higher`) }
  if (v.hr != null) { if (v.hr > 130 || v.hr < 40) up('Immediate', `Pulse ${v.hr} bpm is outside 40–130`); else if (v.hr > 110) up('Soon', `Pulse ${v.hr} bpm is above 110`) }
  if (v.sys != null) { if (v.sys < 90 || v.sys > 180) up('Immediate', `Systolic BP ${v.sys} is outside 90–180`); else if (v.sys > 160) up('Soon', `Systolic BP ${v.sys} is above 160`) }
  if ((p.age >= 65 || p.age <= 2) && level === 'Routine') up('Soon', 'Higher-risk age group')
  const missing = VITALS.filter(([k]) => num(p.vitals[k]) == null).map(x => x[1])
  if (!why.length) why.push('No red flags in symptoms or available vitals')
  if (missing.length) why.push('Vitals missing — Staff review required')
  return { level, reason: why.join('. ') + '.', missing }
}
const prio = p => p.override?.level ?? triage(p).level
const waitMins = (p, now) => Math.max(0, Math.floor((now - p.arrived) / 60000))

/* ---------- sample data & persistence ---------- */
function makeSeed() {
  const P = (id, token, name, age, symptoms, [temp, hr, spo2, sys], wait, status = 'Waiting') =>
    ({ id, token, name, age, symptoms, vitals: { temp, hr, spo2, sys }, arrived: ago(wait), status })
  const patients = [
    P('p1', 'T-101', 'Rahul Parihar', 21, 'General check-up', ['36.8', '72', '98', '120'], 12),
    P('p2', 'T-102', 'Diya Sharma', 8, 'Fever and cough for 2 days', ['38.6', '108', '97', '100'], 35),
    P('p3', 'T-103', 'Rohan Verma', 31, 'Mild sore throat', ['36.9', '78', '99', '118'], 52),
    P('p4', 'T-104', 'Meera Nair', 67, 'Dizziness and nausea since morning', ['', '', '', ''], 28),
    P('p5', 'T-105', 'Kabir Singh', 24, 'Ankle sprain after a fall', ['36.8', '84', '99', '122'], 20),
    P('p6', 'T-106', 'Ishita Rao', 42, 'Persistent headache', ['37.0', '80', '', ''], 65, 'In consultation'),
    P('p7', 'T-107', 'Nisha Iyer', 5, 'Breathing difficulty and wheezing', ['37.4', '124', '90', ''], 8),
  ]
  const T = (patientId, kind, title, status, extra = {}) =>
    ({ id: uid(), patientId, kind, title, status, created: ago(15), ...extra })
  const tasks = [
    T('p1', 'review', 'Confirm intake details for T-101 Rahul Parihar', 'Open'),
    T('p4', 'review', 'Collect missing vitals for T-104 Meera Nair', 'Assigned', { assignee: STAFF }),
    T('p5', 'review', 'T-105 Kabir Singh: X-ray request reviewed', 'Closed', { assignee: STAFF, ack: true }),
  ]
  return { patients, tasks, audit: [{ id: uid(), ts: ago(30), text: 'Demo loaded with synthetic patients and tasks' }] }
}
const load = () => { try { return JSON.parse(localStorage.getItem('opdflow_v2')) || makeSeed() } catch { return makeSeed() } }

/* ---------- small pieces ---------- */
const Badge = ({ level }) => <span className={`badge ${level.toLowerCase()}`}>{level}</span>

function Queue({ patients, now, onOpen }) {
  const [q, setQ] = useState('')
  const [f, setF] = useState('All')
  const rows = patients
    .filter(p => (f === 'All' || prio(p) === f) && `${p.name} ${p.token} ${p.symptoms}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || RANK[prio(b)] - RANK[prio(a)] || a.arrived - b.arrived)
  return (
    <section className="card">
      <div className="toolbar">
        <h2>Patient queue</h2>
        <input className="search" placeholder="Search name, token, symptoms…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="chips">
          {['All', ...LEVELS].map(l => <button key={l} className={f === l ? 'chip on' : 'chip'} onClick={() => setF(l)}>{l}</button>)}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Token</th><th>Patient</th><th>Symptoms</th><th>Wait</th><th>Suggested priority</th><th>Vitals</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(p => {
              const t = triage(p), w = waitMins(p, now)
              return (
                <tr key={p.id} onClick={() => onOpen(p.id)}>
                  <td className="tok">{p.token}</td>
                  <td><b>{p.name}</b><div className="sub">{p.age} yrs</div></td>
                  <td className="sym">{p.symptoms}</td>
                  <td className={p.status === 'Waiting' && w >= WAIT_LIMIT ? 'long' : ''}>{p.status === 'Waiting' ? `${w} min` : '—'}</td>
                  <td>
                    <Badge level={prio(p)} />{p.override && <span className="sub"> overridden</span>}
                    <div className="sub why">{p.override ? `Nurse override: ${p.override.reason}` : t.reason}</div>
                  </td>
                  <td>{t.missing.length ? <><span className="missing">Missing</span><div className="sub">{t.missing.join(', ')} · Staff review required</div></> : <span className="ok">Complete</span>}</td>
                  <td><span className={`status s-${p.status.split(' ')[0].toLowerCase()}`}>{p.status}</span></td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan="7" className="empty">No patients match. Clear the search or filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Drawer({ p, now, onClose, onOverride, onWorse, onStatus }) {
  const t = triage(p), cur = prio(p)
  const [lvl, setLvl] = useState(cur)
  const [why, setWhy] = useState('')
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer">
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        <p className="sub">{p.token} · {p.age} yrs · waiting {waitMins(p, now)} min</p>
        <h2>{p.name}</h2>
        <div className="row"><Badge level={cur} /><span className={`status s-${p.status.split(' ')[0].toLowerCase()}`}>{p.status}</span>{p.worse && <span className="badge flag">Reported worse</span>}</div>

        <h3>Why this priority</h3>
        <p className="note">{p.override ? <><b>Rule suggestion: {t.level}.</b> {t.reason}<br /><b>Nurse override to {p.override.level}:</b> {p.override.reason}</> : t.reason}</p>
        <h3>Symptoms</h3>
        <p>{p.symptoms}</p>

        <h3>Vitals</h3>
        <div className="vgrid">
          {VITALS.map(([k, label, unit]) => (
            <div key={k} className={'vital' + (num(p.vitals[k]) == null ? ' miss' : '')}>
              <span className="sub">{label}</span>
              {num(p.vitals[k]) == null ? <><b>Missing</b><small>Staff review required</small></> : <b>{p.vitals[k]} <small>{unit}</small></b>}
            </div>
          ))}
        </div>
        {t.missing.length > 0 && <p className="note warn">Missing information: {t.missing.join(', ')}. Values are never estimated.</p>}

        <h3>Nurse override</h3>
        <div className="form-row">
          <select value={lvl} onChange={e => setLvl(e.target.value)}>{LEVELS.map(l => <option key={l}>{l}</option>)}</select>
          <select value={why} onChange={e => setWhy(e.target.value)}><option value="">Select reason…</option>{REASONS.map(r => <option key={r}>{r}</option>)}</select>
        </div>
        <button className="btn" disabled={!why || lvl === cur} onClick={() => onOverride(p.id, lvl, why)}>Apply override</button>

        <h3>Actions</h3>
        <div className="row">
          {p.status === 'Waiting' && <button className="btn ghost" onClick={() => onStatus(p.id, 'In consultation')}>Call in</button>}
          {p.status === 'In consultation' && <button className="btn ghost" onClick={() => onStatus(p.id, 'Done')}>Mark done</button>}
          <button className="btn warnbtn" onClick={() => onWorse(p.id)}>Report patient feels worse</button>
        </div>
        <p className="sub">Reporting creates a review task. It does not change priority automatically.</p>
      </aside>
    </>
  )
}

function RegisterModal({ onClose, onSave }) {
  const [f, setF] = useState({ name: '', age: '', symptoms: '', temp: '', hr: '', spo2: '', sys: '' })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const prev = f.symptoms.trim() && triage({ ...f, age: +f.age || 30, vitals: f })
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="modal" onSubmit={e => { e.preventDefault(); onSave(f) }}>
        <h2>Register patient</h2>
        <p className="sub">Enter patient details. Vitals are optional — leave blank if not measured.</p>
        <label>Patient name<input required value={f.name} onChange={set('name')} placeholder="Rahul Parihar" /></label>
        <div className="form-row">
          <label>Age<input required type="number" min="0" max="120" value={f.age} onChange={set('age')} /></label>
          <label className="grow">Symptoms<input required value={f.symptoms} onChange={set('symptoms')} placeholder="e.g. Fever and cough" /></label>
        </div>
        <div className="vgrid">
          {VITALS.map(([k, label, unit]) => <label key={k}>{label} ({unit})<input type="number" step="any" value={f[k]} onChange={set(k)} placeholder="Optional" /></label>)}
        </div>
        {prev && <div className="note"><Badge level={prev.level} /> <span>{prev.reason}</span></div>}
        <div className="row end"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn">Add to queue</button></div>
      </form>
    </>
  )
}

/* ---------- app ---------- */
export default function App() {
  const [db, setDb] = useState(load)
  const [view, setView] = useState('Dashboard')
  const [selId, setSelId] = useState(null)
  const [showReg, setShowReg] = useState(false)
  const [tick, setTick] = useState(0)
  const { patients, tasks, audit } = db
  const now = Date.now()

  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t) }, [])
  useEffect(() => { try { localStorage.setItem('opdflow_v2', JSON.stringify(db)) } catch { /* ignore */ } }, [db])

  // Long waits create an operational review task only. Clinical priority is never touched.
  useEffect(() => {
    setDb(d => {
      const need = d.patients.filter(p => p.status === 'Waiting' && waitMins(p, now) >= WAIT_LIMIT && !d.tasks.some(t => t.patientId === p.id && t.kind === 'delay'))
      if (!need.length) return d
      return {
        ...d,
        tasks: [...need.map(p => ({ id: uid(), patientId: p.id, kind: 'delay', title: `Operational review: ${p.token} ${p.name} waiting ${WAIT_LIMIT}+ min`, note: 'Wait-time alert only. Clinical priority is unchanged.', status: 'Open', created: now })), ...d.tasks],
        audit: [...need.map(p => ({ id: uid(), ts: now, text: `Wait-time task created for ${p.token} (priority not changed)` })), ...d.audit],
      }
    })
  }, [tick, patients.length])

  const act = (text, fn) => setDb(d => ({ ...d, ...fn(d), audit: [{ id: uid(), ts: now, text }, ...d.audit] }))
  const patch = (id, ch) => d => ({ patients: d.patients.map(p => (p.id === id ? { ...p, ...ch } : p)) })
  const find = id => patients.find(p => p.id === id)

  const register = f => {
    const id = uid()
    const token = 'T-' + (Math.max(100, ...patients.map(p => +p.token.slice(2))) + 1)
    const p = { id, token, name: f.name.trim(), age: +f.age, symptoms: f.symptoms.trim(), vitals: { temp: f.temp, hr: f.hr, spo2: f.spo2, sys: f.sys }, arrived: now, status: 'Waiting' }
    act(`Registered ${token} ${p.name} — suggested ${triage(p).level}`, d => ({ patients: [...d.patients, p] }))
    setShowReg(false); setView('Dashboard'); setSelId(id)
  }
  const override = (id, level, reason) => {
    const p = find(id)
    act(`Priority override ${p.token}: ${prio(p)} → ${level} (${reason}) by ${STAFF}`, patch(id, { override: { level, reason } }))
  }
  const worsen = id => {
    const p = find(id)
    act(`Worsening reported for ${p.token} — review task created, priority unchanged`, d => ({
      ...patch(id, { worse: true })(d),
      tasks: [{ id: uid(), patientId: id, kind: 'worsening', title: `Reassess ${p.token} ${p.name}: patient reports feeling worse`, note: 'Priority NOT changed automatically. Staff to decide.', status: 'Open', created: now }, ...d.tasks],
    }))
  }
  const setStatus = (id, status) => act(`${find(id).token} status changed to ${status}`, patch(id, { status }))
  const taskAct = (t, type) => {
    const ch = { assign: { status: 'Assigned', assignee: STAFF }, ack: { ack: true }, close: { status: 'Closed', ack: true } }[type]
    const text = { assign: `Task assigned to ${STAFF}`, ack: `Task acknowledged by ${STAFF}`, close: `Task closed by ${STAFF}` }[type]
    act(`${text}: ${t.title}`, d => ({ tasks: d.tasks.map(x => (x.id === t.id ? { ...x, ...ch } : x)) }))
  }
  const nav = n => (n === 'Register Patient' ? setShowReg(true) : setView(n))

  const openTasks = tasks.filter(t => t.status !== 'Closed').length
  const cards = [
    ['Total patients', patients.length, 'navy'],
    ['Waiting', patients.filter(p => p.status === 'Waiting').length, 'teal'],
    ['Immediate review flags', patients.filter(p => p.status !== 'Done' && prio(p) === 'Immediate').length, 'red'],
    ['Open tasks', openTasks, 'amber'],
  ]
  const sel = find(selId)

  return (
    <>
      <div className="top">
        <header>
          <div className="logo"><span className="mark">+</span>OPD Flow</div>
          <nav>{NAV.map(n => <button key={n} className={view === n ? 'on' : ''} onClick={() => nav(n)}>{n}{n === 'Review Tasks' && openTasks > 0 && <i>{openTasks}</i>}</button>)}</nav>
        </header>
      </div>

      <main>
        {view === 'Dashboard' && (
          <>
            <div className="hero">
              <div><h1>Outpatient flow, at a glance</h1><p>A clear view of patient visits, review tasks, and staff decisions.</p></div>
              <button className="btn" onClick={() => setShowReg(true)}>Register patient</button>
            </div>
            <div className="cards">{cards.map(([label, n, c]) => <div key={label} className={`stat ${c}`}><span>{label}</span><b>{n}</b></div>)}</div>
            <div className="split">
              <Queue patients={patients} now={now} onOpen={setSelId} />
              <section className="card feed">
                <h2>Recent activity</h2>
                {audit.slice(0, 6).map(a => <p key={a.id}><time>{hhmm(a.ts)}</time>{a.text}</p>)}
                <button className="link" onClick={() => setView('Audit Trail')}>View full audit trail</button>
              </section>
            </div>
          </>
        )}
        {view === 'Patient Queue' && <Queue patients={patients} now={now} onOpen={setSelId} />}
        {view === 'Review Tasks' && (
          <>
            <h1>Review tasks</h1>
            <div className="board">
              {['Open', 'Assigned', 'Closed'].map(s => (
                <section key={s} className="col">
                  <h2>{s} <span className="count">{tasks.filter(t => t.status === s).length}</span></h2>
                  {tasks.filter(t => t.status === s).map(t => (
                    <div key={t.id} className="task">
                      <b>{t.title}</b>
                      {t.note && <p className="sub">{t.note}</p>}
                      <p className="sub">{find(t.patientId) && <button className="link" onClick={() => setSelId(t.patientId)}>{find(t.patientId).token}</button>} {t.assignee ? `· ${t.assignee}` : '· Unassigned'}{t.ack ? ' · Acknowledged' : ''}</p>
                      {s !== 'Closed' && (
                        <div className="row">
                          {s === 'Open' && <button className="btn sm" onClick={() => taskAct(t, 'assign')}>Assign to me</button>}
                          {!t.ack && <button className="btn ghost sm" onClick={() => taskAct(t, 'ack')}>Acknowledge</button>}
                          <button className="btn ghost sm" onClick={() => taskAct(t, 'close')}>Close</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!tasks.some(t => t.status === s) && <p className="empty">Nothing here.</p>}
                </section>
              ))}
            </div>
          </>
        )}
        {view === 'Audit Trail' && (
          <>
            <h1>Audit trail</h1>
            <section className="card timeline">
              {audit.map(a => <div key={a.id}><time>{hhmm(a.ts)}</time><span>{a.text}</span></div>)}
            </section>
          </>
        )}
      </main>

      {sel && <Drawer key={sel.id} p={sel} now={now} onClose={() => setSelId(null)} onOverride={override} onWorse={worsen} onStatus={setStatus} />}
      {showReg && <RegisterModal onClose={() => setShowReg(false)} onSave={register} />}
    </>
  )
}
