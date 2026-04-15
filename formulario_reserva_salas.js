const BLOCKED = ['gmail', 'hotmail', 'yahoo', 'outlook', 'live', 'icloud', 'aol', 'protonmail', 'zoho', 'yandex'];

const WEBHOOK_URL = 'https://pruebasauto015.app.n8n.cloud/webhook/agendar-cita';
const CHECK_URL = 'https://pruebasauto015.app.n8n.cloud/webhook/ver-disponibilidad';

// Festivos Colombia (YYYY-MM-DD) para bloquear en el calendario
const HOLIDAYS = [
  // 2024
  '2024-01-01', '2024-01-08', '2024-03-25', '2024-03-28', '2024-03-29',
  '2024-05-01', '2024-05-13', '2024-06-03', '2024-06-10', '2024-07-01',
  '2024-07-20', '2024-08-07', '2024-08-19', '2024-10-14', '2024-11-04',
  '2024-11-11', '2024-12-08', '2024-12-25',
  // 2025
  '2025-01-01', '2025-01-06', '2025-03-24', '2025-04-17', '2025-04-18',
  '2025-05-01', '2025-06-02', '2025-06-23', '2025-06-30', '2025-07-20',
  '2025-08-07', '2025-08-18', '2025-10-13', '2025-11-03', '2025-11-17',
  '2025-12-08', '2025-12-25'
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

    if (isWe || isPast || isHoliday) {
      cls += ' disabled';
      clickAttr = ''; // Bloquea el clic en fines de semana, días pasados y festivos
    }

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

  // Novedad: Obtener y mostrar disponibilidad
  fetchAvailability(selDate);
}

const ALL_HOURS = ['7:00 am', '8:00 am', '9:00 am', '10:00 am', '11:00 am', '12:00 pm', '1:00 pm', '2:00 pm', '3:00 pm', '4:00 pm', '5:00 pm'];

async function fetchAvailability(dt) {
  if (!dt) return;

  // Limpiar horas ocupadas inmediatamente para no heredar bloqueos del día anterior
  currentBusyHours.clear();

  const isoDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const tl = document.getElementById('timeline');
  const msgDiv = document.getElementById('timeline-message');
  if (!tl) return;

  tl.innerHTML = '<div class="timeline-spinner">Sincronizando con Google Sheets...</div>';
  if (msgDiv) msgDiv.innerHTML = '';

  try {
    const res = await fetch(`${CHECK_URL}?fecha=${isoDate}&_t=${Date.now()}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      cache: 'no-store'
    });
    if (!res.ok) throw new Error();
    let data = await res.json();

    // N8N a veces devuelve array envuelto o un puro objeto
    if (!Array.isArray(data) && data[0] === undefined) {
      if (data.data) data = data.data;
      else data = [data];
    }

    tl.innerHTML = '';
    let busyHours = new Set();

    data.forEach(r => {
      let rHour = (r["Hora de Inicio"] || r["hora"] || "").toString().trim().toLowerCase();
      if (!rHour) return;

      // Remover el cero inicial si Excel/N8N lo manda como "07:00 am"
      if (rHour.startsWith('0')) rHour = rHour.substring(1);

      // Quitar posibles puntos en "a. m."
      rHour = rHour.replace(/\./g, '').replace('a m', 'am').replace('p m', 'pm');

      let startIdx = ALL_HOURS.indexOf(rHour);
      if (startIdx !== -1) {
        let dur = parseInt(r["Duración (H)"] || r["duracion"] || "1");
        for (let i = 0; i < dur; i++) {
          if (ALL_HOURS[startIdx + i]) {
            busyHours.add(ALL_HOURS[startIdx + i]);
            currentBusyHours.add(ALL_HOURS[startIdx + i]);
          }
        }
      }
    });

    ALL_HOURS.forEach(hr => {
      const slot = document.createElement('div');
      slot.className = 'timeline-slot' + (busyHours.has(hr) ? ' busy' : '');
      slot.setAttribute('data-time', hr);
      tl.appendChild(slot);
    });

    // Bloquear botones físicos de hora en el grid
    const cards = document.querySelectorAll('.time-card');
    cards.forEach(card => {
      const lbl = card.querySelector('.time-label').innerText.trim();
      if (busyHours.has(lbl)) {
        card.classList.add('disabled-slot');
      } else {
        card.classList.remove('disabled-slot');
      }
    });

    if (msgDiv) {
      if (busyHours.size === 0) {
        msgDiv.innerHTML = '✨ ¡Esta fecha está libre en su totalidad! Sé el primero en reservar.';
        msgDiv.style.color = 'var(--color-success)';
      } else {
        msgDiv.innerHTML = `📝 Hay ${busyHours.size} hora(s) ya ocupada(s). Elige una franja libre abajo.`;
        msgDiv.style.color = 'var(--color-text-main)';
      }
    }

  } catch (err) {
    console.error("Timeline catch", err);
    tl.innerHTML = '';
    ALL_HOURS.forEach(hr => {
      const slot = document.createElement('div');
      slot.className = 'timeline-slot';
      slot.setAttribute('data-time', hr);
      tl.appendChild(slot);
    });

    const cards = document.querySelectorAll('.time-card');
    cards.forEach(card => {
      card.classList.remove('disabled-slot');
    });

    if (msgDiv) {
      msgDiv.innerHTML = '✨ ¡Esta fecha parece estar libre en su totalidad! Selecciona tu hora.';
      msgDiv.style.color = 'var(--color-success)';
    }
  }
}

function renderSlots() {
  const el = document.getElementById('time-slots');
  el.innerHTML = '';
  for (let h = 7; h <= 16; h++) {
    const label = h < 12 ? `${h}:00 am` : h === 12 ? '12:00 pm' : `${h - 12}:00 pm`;
    const div = document.createElement('div');
    div.className = 'time-card' + (selHour === h ? ' selected-slot' : '');
    div.innerHTML = `<div class="time-label">${label}</div><div class="time-sub">Inicio de franja</div>`;
    div.onclick = () => selectHour(h);
    el.appendChild(div);
  }
}
function selectHour(h) {
  selHour = h; selDur = null;

  // En vez de destruir y recrear todas las tarjetas, 
  // solo actualizamos las clases visuales de selección para no perder las rojas
  document.querySelectorAll('.time-card').forEach(c => {
    const lbl = c.querySelector('.time-label').innerText.trim();
    if (lbl === fmt(h)) {
      c.classList.add('selected-slot');
    } else {
      c.classList.remove('selected-slot');
    }
  });

  hideErr('hora');
  document.getElementById('field-dur').style.display = 'block';
  renderDur();
  document.getElementById('summary').style.display = 'none';
}
function renderDur() {
  const el = document.getElementById('dur-btns');
  el.innerHTML = '';
  let max = Math.min(4, 17 - selHour);

  // Evitar que la duración cruce una hora que ya está ocupada
  for (let i = 1; i <= max; i++) {
    let checkHourStr = fmt(selHour + i - 1);
    if (currentBusyHours.has(checkHourStr)) {
      max = i - 1;
      break;
    }
  }

  // Por si acaso max bajó a 0 en una hora ocupada que se forzó seleccionar, 
  // no debería pasar porque el botón estaría deshabilitado:
  if (max < 1) max = 1;

  for (let i = 1; i <= max; i++) {
    const b = document.createElement('button');
    b.className = 'dur-btn' + (selDur === i ? ' active' : '');
    b.textContent = i === 1 ? '1 hora' : `${i} horas`;
    b.onclick = () => selectDur(i);
    el.appendChild(b);
  }
}
function selectDur(d) {
  selDur = d;
  renderDur();
  hideErr('dur');
  updateSummary();
}
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
  if (!selDate) { showErr('fecha'); ok = false; } else hideErr('fecha');
  if (selHour === null) { showErr('hora'); ok = false; } else hideErr('hora');
  if (!selDur) { showErr('dur'); ok = false; } else hideErr('dur');
  if (!ok) return;

  gNombre = nombre; gArea = area;
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step-sending').style.display = 'block';

  // Dar formato a fecha (YYYY-MM-DD)
  const yyyy = selDate.getFullYear();
  const mm = String(selDate.getMonth() + 1).padStart(2, '0');
  const dd = String(selDate.getDate()).padStart(2, '0');
  const fechaStrAPI = `${yyyy}-${mm}-${dd}`;

  // Preparamos el payload a enviar hacia n8n
  const payload = {
    correo: gEmail,
    nombre: nombre,
    celular: celular,
    area: area,
    fecha: fechaStrAPI,
    horaStr: fmt(selHour),
    horaFinStr: fmt(selHour + selDur),
    duracion: selDur
  };

  // Validación rápida para verificar si ya se pegó la URL
  if (WEBHOOK_URL === 'PEGAR_AQUI_URL_DE_N8N') {
    alert("¡Alerta Dev! Aún no has pegado la URL del Webhook de n8n en el archivo JS (Línea 3). Se usará la simulación de tiempo.");
    setTimeout(() => showConfirmation(nombre, area), 1800);
    return;
  }

  // --- CONEXIÓN REAL A N8N ---
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
    .then(res => {
      if (!res.ok) throw new Error("Error en el servidor de n8n");
      return res.json();
    })
    .then(data => {
      if (data && data.success === false) {
        // Restaurar pantalla de reserva
        document.getElementById('step-sending').style.display = 'none';
        document.getElementById('step2').style.display = 'block';

        // Crear o actualizar banner de error corporativo
        let errBox = document.getElementById('err-backend');
        if (!errBox) {
          errBox = document.createElement('div');
          errBox.id = 'err-backend';
          errBox.style = "color: #e53e3e; background: #fff5f5; border: 1px solid #fc8181; border-radius: 6px; padding: 12px; margin-top: 15px; text-align: center; line-height: 1.4; font-size: 13.5px; animation: fadeIn 0.3s;";
          const step2 = document.getElementById('step2');
          step2.insertBefore(errBox, step2.lastElementChild);
        }
        errBox.innerHTML = `🚫 <b>Horario no disponible:</b> ${data.error || "Esta sala ya está ocupada en el horario seleccionado. Por favor elige otro."}`;
        return;
      }

      // Si todo sale bien (success: true o respuesta exitosa estándar):
      showConfirmation(nombre, area);
    })
    .catch(err => {
      console.error('Falló la conexión con el webhook:', err);
      alert('Oops. Ocurrió un error al procesar tu solicitud. Asegúrate de que el flujo de n8n está activo (o en "Listen" para testeo).');

      // Devolvemos al usuario al formulario si algo explotó.
      document.getElementById('step-sending').style.display = 'none';
      document.getElementById('step2').style.display = 'block';
    });
}

function showConfirmation(nombre, area) {
  document.getElementById('step-sending').style.display = 'none';
  const dd = selDate.getDate().toString().padStart(2, '0');
  const mm = (selDate.getMonth() + 1).toString().padStart(2, '0');
  const yy = selDate.getFullYear();
  const fechaStr = `${DAYS_ES[selDate.getDay()]} ${dd}/${mm}/${yy}`;
  const horario = `${fmt(selHour)} – ${fmt(selHour + selDur)}`;
  const durStr = selDur === 1 ? '1 hora' : `${selDur} horas`;
  const folio = 'RES-' + yy + mm + dd + '-' + Math.floor(Math.random() * 9000 + 1000);
  const iniciales = nombre.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('');

  document.getElementById('confirm-email-txt').textContent = gEmail;
  document.getElementById('ep-to').textContent = gEmail;
  document.getElementById('ep-folio').textContent = 'Folio: ' + folio;
  document.getElementById('ep-fecha').textContent = fechaStr;
  document.getElementById('ep-horario').textContent = horario;
  document.getElementById('ep-dur').textContent = durStr;
  document.getElementById('ep-area').textContent = area;
  document.getElementById('ep-year').textContent = yy;
  document.getElementById('ep-greeting').innerHTML =
    `Hola <strong>${nombre}</strong>,<br>Tu solicitud de reserva ha sido registrada exitosamente. A continuación el resumen de tu reserva:`;

  document.getElementById('step3').style.display = 'block';
}

function resetForm() {
  selDate = null; selHour = null; selDur = null;
  currentBusyHours.clear();
  gEmail = ''; gNombre = ''; gArea = '';
  document.getElementById('step3').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
  document.getElementById('step2').style.display = 'none';
  document.getElementById('email').value = '';
  document.getElementById('valid-email-row').style.display = 'none';
  document.getElementById('nombre').value = '';
  document.getElementById('celular').value = '';
  document.getElementById('area').value = '';
  document.getElementById('field-hora').style.display = 'none';
  document.getElementById('field-dur').style.display = 'none';
  document.getElementById('summary').style.display = 'none';

  const errBox = document.getElementById('err-backend');
  if (errBox) errBox.remove();
}
