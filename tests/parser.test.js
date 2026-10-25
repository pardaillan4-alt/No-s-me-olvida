const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, nextOccurrence } = require('../parser.js');

// Sábado 24 de octubre de 2026, 10:00 hora local
const now = new Date(2026, 9, 24, 10, 0, 0);
const p = (t, o) => parse(t, Object.assign({ now }, o));
const local = (iso) => {
  const d = new Date(iso);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};

test('lista de compras se divide en artículos', () => {
  const r = p('comprar leche, pan y huevos');
  assert.deepEqual(r.map((x) => x.title), ['Leche', 'Pan', 'Huevos']);
  assert.ok(r.every((x) => x.cat === 'compras' && x.due === null));
});

test('artículo suelto con #compras', () => {
  const r = p('pilas para el control #super');
  assert.equal(r.length, 1);
  assert.equal(r[0].cat, 'compras');
  assert.equal(r[0].title, 'Pilas para el control');
});

test('escuela con persona, mañana y hora am', () => {
  const [r] = p('firmar la tarea de @sofi mañana 7am');
  assert.equal(r.cat, 'escuela');
  assert.equal(r.person, 'Sofi');
  assert.equal(r.title, 'Firmar la tarea de Sofi');
  assert.deepEqual(local(r.due), [2026, 10, 25, 7, 0]);
  assert.equal(r.hasTime, true);
});

test('"a las 4" se entiende como la tarde y día de la semana', () => {
  const [r] = p('reunión con el jefe el jueves a las 4');
  assert.equal(r.cat, 'trabajo');
  assert.equal(r.title, 'Reunión con el jefe');
  assert.deepEqual(local(r.due), [2026, 10, 29, 16, 0]);
});

test('junta de padres es escuela, no trabajo', () => {
  const [r] = p('junta de padres el 3 de noviembre a las 8 de la mañana');
  assert.equal(r.cat, 'escuela');
  assert.deepEqual(local(r.due), [2026, 11, 3, 8, 0]);
});

test('repetición semanal con día', () => {
  const [r] = p('sacar la basura cada martes en la noche');
  assert.equal(r.repeat, 'weekly');
  assert.equal(r.title, 'Sacar la basura');
  assert.deepEqual(local(r.due), [2026, 10, 27, 20, 0]);
});

test('tiempo relativo', () => {
  const [r] = p('llamar al cliente en 30 minutos');
  assert.equal(r.cat, 'trabajo');
  assert.deepEqual(local(r.due), [2026, 10, 24, 10, 30]);
});

test('hora sin fecha que ya pasó es para mañana', () => {
  const [r] = p('tomar la pastilla a las 9:00');
  assert.deepEqual(local(r.due), [2026, 10, 25, 9, 0]);
});

test('24 horas y mediodía', () => {
  assert.deepEqual(local(p('enviar reporte hoy 17:30')[0].due), [2026, 10, 24, 17, 30]);
  assert.deepEqual(local(p('pagar luz hoy a mediodía')[0].due), [2026, 10, 24, 12, 0]);
  assert.deepEqual(local(p('cita 12:30 mañana')[0].due), [2026, 10, 25, 12, 30]);
});

test('fecha numérica y "y media"', () => {
  const [r] = p('festival 15/12 a las 5 y media');
  assert.deepEqual(local(r.due), [2026, 12, 15, 17, 30]);
});

test('fecha sin hora no tiene hora', () => {
  const [r] = p('llevar disfraz pasado mañana');
  assert.equal(r.hasTime, false);
  assert.deepEqual(local(r.due).slice(0, 3), [2026, 10, 26]);
});

test('sin pistas cae en personal', () => {
  const [r] = p('regar las plantas');
  assert.equal(r.cat, 'personal');
  assert.equal(r.due, null);
});

test('siguiente repetición', () => {
  const due = new Date(2026, 9, 23, 8, 0).toISOString(); // viernes
  assert.deepEqual(local(nextOccurrence(due, 'weekdays', new Date(2026, 9, 22))), [2026, 10, 26, 8, 0]);
  assert.deepEqual(local(nextOccurrence(new Date(2026, 0, 31).toISOString(), 'monthly', new Date(2026, 0, 1))), [2026, 2, 28, 0, 0]);
  // muy atrasada: salta al futuro
  assert.ok(new Date(nextOccurrence(new Date(2026, 0, 1).toISOString(), 'daily', now)) >= now);
});

test('pagos y citas van a personal', () => {
  assert.equal(p('pagar la luz el viernes')[0].cat, 'personal');
  assert.equal(p('cita con el dentista mañana a las 5')[0].cat, 'personal');
  assert.equal(p('pagar factura del proveedor')[0].cat, 'trabajo');
});

test('reconoce a los hijos sin @ y sin acentos', () => {
  const kids = ['Jesús', 'Julián'];
  const [a] = p('llevar cartulina de jesus el lunes', { kids });
  assert.equal(a.person, 'Jesús');
  assert.equal(a.cat, 'escuela');
  assert.equal(a.title, 'Llevar cartulina de Jesús');

  const [b] = p('@julian clase de natación a las 5', { kids });
  assert.equal(b.person, 'Julián');
  assert.equal(b.title, 'Julián clase de natación');

  const [c] = p('vacuna de los niños el 3 de noviembre', { kids });
  assert.equal(c.person, 'Jesús y Julián');
  assert.equal(c.cat, 'personal'); // "vacuna" manda sobre el nombre

  const [d] = p('recoger a Jesús y a Julián a las 2', { kids });
  assert.equal(d.person, 'Jesús y Julián');
  assert.equal(d.cat, 'escuela');

  // "Jesús" dentro de otra palabra no cuenta
  assert.equal(p('comprar jesusitos de chocolate', { kids })[0].person, null);
});
