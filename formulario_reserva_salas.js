const BLOCKED = ['gmail', 'hotmail', 'yahoo', 'outlook', 'live', 'icloud', 'aol', 'protonmail', 'zoho', 'yandex'];

const WEBHOOK_URL = 'https://pruebasauto015.app.n8n.cloud/webhook/agendar-cita';
const CHECK_URL = 'https://pruebasauto015.app.n8n.cloud/webhook/ver-disponibilidad';

const HOLIDAYS = [
  '2024-01-01', '2024-01-08', '2024-03-25', '2024-03-28', '2024-03-29', '2024-05-01', '2024-05-13', '2024-06-03', '2024-06-10', '2024-07-01', '2024-07-20', '2024-08-07', '2024-08-19', '2024-10-14', '2024-11-04', '2024-11-11', '2024-12-08', '2024-12-25',
  '2025-01-01', '2025-01-06', '2025-03-24', '2025-04-17', '2025-04-18', '2025-05-01', '2025-06-02', '2025-06-23', '2025-06-30', '2025-07-20', '2025-08-07', '2025-08-18', '2025-10-13', '2025-11-03', '2025-11-17', '2025-12-08', '2025-12-25'
];

let selDate = null, selHour = null, selDur = null;
let currentBusyHours = new Set();
let calYear, calMonth;
let gEmail = '', gNombre = '', gArea = '';

function validateEmail() {
  const v = document.getElementById('email').value.trim();
  const rx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!rx.test(v)) { showErr('email'); return; }
  const dom = v.split('@')[1].split('.')[0].toLowerCase();
  if (BLOCKED.includes(dom)) { showErr('email'); return; }
  hideErr('email');
  gEmail = v;
  document.getElementById('email-display').textContent = v;
  document.getElementById('valid-email-row').style.display = 'flex';
  setTimeout(() => {
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';
    initCal();
  }, 700);
}

function showErr(id) {
  document.getElementById('err-' + id).style.display = 'block';
  const i = document.getElementById(id);
  if (i) i.classList.add('input-err');
}
function hideErr(id) {
  document.getElementById('err-' + id).style.display = 'none';
  const i = document.getElementById(id);
  if (i) i.classList.remove('input-err');
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DOWS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

function initCal() {
  const n = new Date();
  calYear = n.getFullYear(); calMonth = n.getMonth();
  renderCal();
}
function changeMonth(d) {
  calMonth += d;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCal();
}
function renderCal() {
  document.getElementById('cal-title').textContent = MONTHS[calMonth] + ' ' + calYear;
  document.getElementById('cal-dows').innerHTML = DOWS.map(d => `<div class="cal-dow">${d}</div>`).join('');
  const el = document.getElementById('cal-days');
  el.innerHTML = '';
  const first = new Date(calYear, calMonth, 1).getDay();
  const total = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < first; i++) {
    const p = new Date(calYear, calMonth, -first + i + 1).getDate();
    el.innerHTML += `<div class="cal-day other-month disabled">${p}</div>`;
  }
  for (let d = 1; d <= total; d++) {
    const dt = new Date(calYear, calMonth, d);
    const dow = dt.getDay();
    const isoDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const isWe = dow === 0 || dow === 6;
    const isPast = dt < today;
    const isHoliday = HOLIDAYS.includes(isoDate);
    const isTd = dt.toDateString() === today.toDateString();
    const isSel = selDate && dt.toDateString() === selDate.toDateString();
    let cls = 'cal-day';
    let clickAttr = ` onclick="selectDate(${calYear},${calMonth},${d})"`;
    if (isWe || isPast || isHoliday) { cls += ' disabled'; clickAttr = ''; }
    if (isTd) cls += ' today';
    if (isSel) cls += ' selected';
    el.innerHTML += `<div class="${cls}"${clickAttr}>${d}</div>`;
  }
}

function selectDate(y, m, d) {
  selDate = new Date(y, m, d);
  selHour = null; selDur = null;
  renderCal();
  hideErr('fecha');
  document.getElementById('field-hora').style.display = 'block';
  renderSlots();
  document.getElementById('field-dur').style.display = 'none';
  document.getElementById('summary').style.display = 'none';
  fetchAvailability(selDate);
}

const ALL_HOURS = ['7:00 am', '8:00 am', '9:00 am', '10:00 am', '11:00 am', '12:00 pm', '1:00 pm', '2:00 pm', '3:00 pm', '4:00 pm', '5:00 pm'];

async function fetchAvailability(dt) {
  if (!dt) return;
  currentBusyHours.clear();
  const isoDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const tl = document.getElementById('timeline');
  const msgDiv = document.getElementById('timeline-message');
  if (!tl) return;
  tl.innerHTML = '<div class="timeline-spinner">Sincronizando con Google Sheets...</div>';
  try {
    const res = await fetch(`${CHECK_URL}?fecha=${isoDate}&_t=${Date.now()}`);
    let data = await res.json();
    if (!Array.isArray(data)) data = data.data || [data];
    tl.innerHTML = '';
    data.forEach(r => {
      let rHour = (r["Hora de Inicio"] || "").toString().trim().toLowerCase().replace(/\./g, '').replace('a m', 'am').replace('p m', 'pm');
      if (rHour.startsWith('0')) rHour = rHour.substring(1);
      let startIdx = ALL_HOURS.indexOf(rHour);
      if (startIdx !== -1) {
        let dur = parseInt(r["Duración (H)"] || "1");
        for (let i = 0; i < dur; i++) {
          if (ALL_HOURS[startIdx + i]) currentBusyHours.add(ALL_HOURS[startIdx + i]);
        }
      }
    });
    ALL_HOURS.forEach(hr => {
      const slot = document.createElement('div');
      slot.className = 'timeline-slot' + (currentBusyHours.has(hr) ? ' busy' : '');
      slot.setAttribute('data-time', hr);
      tl.appendChild(slot);
    });
    document.querySelectorAll('.time-card').forEach(card => {
      const lbl = card.querySelector('.time-label').innerText.trim();
      currentBusyHours.has(lbl) ? card.classList.add('disabled-slot') : card.classList.remove('disabled-slot');
    });
    if (msgDiv) {
      msgDiv.innerHTML = currentBusyHours.size === 0 ? '✨ ¡Fecha libre!' : `📝 Hay ${currentBusyHours.size} horas ocupadas.`;
      msgDiv.style.color = currentBusyHours.size === 0 ? 'var(--color-success)' : 'var(--color-text-main)';
    }
  } catch (err) { tl.innerHTML = ''; }
}

function renderSlots() {
  const el = document.getElementById('time-slots');
  el.innerHTML = '';
  for (let h = 7; h <= 16; h++) {
    const label = fmt(h);
    const div = document.createElement('div');
    div.className = 'time-card' + (selHour === h ? ' selected-slot' : '');
    div.innerHTML = `<div class="time-label">${label}</div><div class="time-sub">Inicio de franja</div>`;
    div.onclick = () => selectHour(h);
    el.appendChild(div);
  }
}
function selectHour(h) {
  selHour = h; selDur = null;
  document.querySelectorAll('.time-card').forEach(c => {
    c.querySelector('.time-label').innerText.trim() === fmt(h) ? c.classList.add('selected-slot') : c.classList.remove('selected-slot');
  });
  hideErr('hora');
  document.getElementById('field-dur').style.display = 'block';
  renderDur();
}
function renderDur() {
  const el = document.getElementById('dur-btns');
  el.innerHTML = '';
  let max = Math.min(4, 17 - selHour);
  for (let i = 1; i <= max; i++) {
    if (currentBusyHours.has(fmt(selHour + i - 1))) { max = i - 1; break; }
  }
  if (max < 1) max = 1;
  for (let i = 1; i <= max; i++) {
    const b = document.createElement('button');
    b.className = 'dur-btn' + (selDur === i ? ' active' : '');
    b.textContent = i === 1 ? '1 hora' : `${i} horas`;
    b.onclick = () => selectDur(i);
    el.appendChild(b);
  }
}
function selectDur(d) { selDur = d; renderDur(); hideErr('dur'); updateSummary(); }
function fmt(h) { return h < 12 ? `${h}:00 am` : h === 12 ? '12:00 pm' : `${h - 12}:00 pm`; }
function updateSummary() {
  if (!selDate || selHour === null || !selDur) return;
  const dd = selDate.getDate().toString().padStart(2, '0');
  const mm = (selDate.getMonth() + 1).toString().padStart(2, '0');
  const yy = selDate.getFullYear();
  document.getElementById('sum-fecha').textContent = `${DAYS_ES[selDate.getDay()]} ${dd}/${mm}/${yy}`;
  document.getElementById('sum-horario').textContent = `${fmt(selHour)} – ${fmt(selHour + selDur)}`;
  document.getElementById('sum-dur').textContent = selDur === 1 ? '1 hora' : `${selDur} horas`;
  document.getElementById('summary').style.display = 'block';
}

function submitForm() {
  let ok = true;
  const nombre = document.getElementById('nombre').value.trim();
  const celular = document.getElementById('celular').value.trim();
  const area = document.getElementById('area').value;
  if (nombre.split(' ').filter(Boolean).length < 2) { showErr('nombre'); ok = false; } else hideErr('nombre');
  if (!/^[0-9]{7,12}$/.test(celular)) { showErr('celular'); ok = false; } else hideErr('celular');
  if (!area) { showErr('area'); ok = false; } else hideErr('area');
  if (!selDate || selHour === null || !selDur) { ok = false; }
  if (!ok) return;

  // GENERACIÓN DE FOLIO ÚNICO
  const yy_folio = selDate.getFullYear().toString().slice(-2);
  const mm_folio = String(selDate.getMonth() + 1).padStart(2, '0');
  const dd_folio = String(selDate.getDate()).padStart(2, '0');
  const random_folio = Math.floor(Math.random() * 9000 + 1000);
  const folioFinal = `RES-${yy_folio}${mm_folio}${dd_folio}-${random_folio}`;

  document.getElementById('step2').style.display = 'none';
  document.getElementById('step-sending').style.display = 'block';

  const payload = {
    correo: gEmail,
    nombre: nombre,
    celular: celular,
    area: area,
    fecha: `${selDate.getFullYear()}-${mm_folio}-${dd_folio}`,
    horaStr: fmt(selHour),
    horaFinStr: fmt(selHour + selDur),
    duracion: selDur,
    folio: folioFinal
  };

  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (data.success === false) {
        document.getElementById('step-sending').style.display = 'none';
        document.getElementById('step2').style.display = 'block';
        let errBox = document.getElementById('err-backend') || document.createElement('div');
        errBox.id = 'err-backend';
        errBox.style = "color: #e53e3e; background: #fff5f5; border: 1px solid #fc8181; border-radius: 6px; padding: 12px; margin-top: 15px; text-align: center;";
        errBox.innerHTML = `🚫 <b>Error:</b> ${data.error}`;
        document.getElementById('step2').appendChild(errBox);
        return;
      }
      showConfirmation(nombre, area, folioFinal);
    })
    .catch(err => {
      alert('Error de conexión con el servidor.');
      document.getElementById('step-sending').style.display = 'none';
      document.getElementById('step2').style.display = 'block';
    });
}

function showConfirmation(nombre, area, folio) {
  document.getElementById('step-sending').style.display = 'none';
  const dd = selDate.getDate().toString().padStart(2, '0');
  const mm = (selDate.getMonth() + 1).toString().padStart(2, '0');
  const yy = selDate.getFullYear();
  document.getElementById('confirm-email-txt').textContent = gEmail;
  document.getElementById('ep-to').textContent = gEmail;
  document.getElementById('ep-folio').textContent = 'Folio: ' + folio;
  document.getElementById('ep-fecha').textContent = `${DAYS_ES[selDate.getDay()]} ${dd}/${mm}/${yy}`;
  document.getElementById('ep-horario').textContent = `${fmt(selHour)} – ${fmt(selHour + selDur)}`;
  document.getElementById('ep-dur').textContent = selDur === 1 ? '1 hora' : `${selDur} horas`;
  document.getElementById('ep-area').textContent = area;
  document.getElementById('ep-year').textContent = yy;
  document.getElementById('ep-greeting').innerHTML = `Hola <strong>${nombre}</strong>,<br>Tu reserva ha sido registrada con el folio <b>${folio}</b>.`;
  document.getElementById('step3').style.display = 'block';
}

function resetForm() { location.reload(); }