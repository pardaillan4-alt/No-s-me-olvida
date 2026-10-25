/* Intérprete de frases en español para crear recordatorios rápidos.
 * Ejemplos:
 *   "comprar leche, pan y huevos"            -> 3 artículos en Compras
 *   "firmar la tarea de @Sofi mañana 7am"     -> Escuela, persona Sofi, mañana 7:00
 *   "reunión con el jefe el jueves a las 4"   -> Trabajo, jueves 16:00
 *   "sacar la basura cada martes en la noche" -> Personal, se repite cada semana
 * Funciona en el navegador (window.NSOParser) y en Node (module.exports).
 */
(function (root) {
  'use strict';

  const L = '\\p{L}\\d';
  const B = `(?<![${L}])`; // inicio de palabra (acepta acentos y ñ)
  const E = `(?![${L}])`; // fin de palabra
  const rx = (src) => new RegExp(src, 'iu');

  const CAT_ALIASES = {
    compras: ['compras', 'compra', 'super', 'súper', 'tienda', 'mercado', 'lista'],
    escuela: ['escuela', 'colegio', 'cole', 'kinder', 'kínder', 'prepa', 'hijos', 'niños'],
    trabajo: ['trabajo', 'oficina', 'chamba', 'work'],
    personal: ['personal', 'casa', 'hogar', 'yo', 'pendiente'],
  };

  // Palabras que delatan la categoría cuando no se usa #etiqueta.
  // El orden importa: escuela va antes que trabajo para que "junta de padres" no sea trabajo.
  const CAT_KEYWORDS = [
    ['escuela', ['escuela', 'colegio', 'kinder', 'kínder', 'tarea', 'tareas', 'maestra', 'maestro', 'miss', 'profe', 'profesor', 'profesora',
      'uniforme', 'mochila', 'lonchera', 'lunch', 'junta de padres', 'firmar', 'boleta', 'cuaderno', 'cuadernos', 'útiles', 'utiles',
      'excursión', 'excursion', 'examen', 'exámenes', 'recoger a', 'llevar a', 'festival', 'cooperación', 'cooperacion', 'colegiatura',
      'inscripción', 'inscripcion', 'clase de', 'natación', 'natacion', 'fútbol', 'futbol', 'ballet', 'maqueta', 'disfraz']],
    ['trabajo', ['trabajo', 'oficina', 'reunión', 'reunion', 'junta', 'informe', 'reporte', 'correo', 'email', 'mail', 'cliente', 'clientes',
      'jefe', 'jefa', 'presentación', 'presentacion', 'factura', 'facturar', 'cotización', 'cotizacion', 'proyecto', 'entregar', 'entrega',
      'llamada', 'proveedor', 'nómina', 'nomina', 'contrato', 'videollamada', 'zoom', 'teams', 'meet']],
    ['compras', ['comprar', 'compra', 'súper', 'super', 'supermercado', 'mercado', 'tienda', 'farmacia', 'leche', 'pan', 'huevo', 'huevos',
      'tortillas', 'fruta', 'frutas', 'verdura', 'verduras', 'carne', 'pollo', 'queso', 'jamón', 'jamon', 'arroz', 'frijol', 'frijoles',
      'azúcar', 'azucar', 'café', 'cafe', 'aceite', 'jabón', 'jabon', 'detergente', 'papel', 'shampoo', 'champú', 'pañales', 'panales',
      'medicina', 'medicinas', 'pastillas', 'agua', 'refresco', 'cereal', 'galletas', 'yogur', 'yogurt', 'mantequilla', 'manzanas',
      'plátanos', 'platanos', 'jitomate', 'tomate', 'cebolla', 'papas', 'pasta', 'atún', 'atun', 'sal', 'croquetas']],
    ['personal', ['pagar', 'pago', 'recibo', 'luz', 'gas', 'renta', 'internet', 'tarjeta', 'banco', 'cita', 'doctor', 'doctora', 'médico',
      'medico', 'dentista', 'pediatra', 'vacuna', 'cumpleaños', 'cumple', 'regalo', 'basura', 'plantas', 'veterinario', 'coche', 'carro',
      'verificación', 'verificacion', 'tintorería', 'tintoreria', 'mamá', 'papá', 'abuela', 'abuelo']],
  ];

  const WEEKDAYS = [
    ['domingo'], ['lunes'], ['martes'], ['miércoles', 'miercoles'], ['jueves'], ['viernes'], ['sábado', 'sabado'],
  ];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre|setiembre', 'octubre', 'noviembre', 'diciembre'];
  const NUM_WORDS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
    once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, media: 0.5 };

  const WD_ALT = WEEKDAYS.map((w) => w.join('|')).join('|');
  const MANANA = 'ma[ñn]ana';

  function weekdayIndex(word) {
    const w = word.toLowerCase();
    return WEEKDAYS.findIndex((alts) => alts.includes(w));
  }

  function toNum(s) {
    if (s == null) return NaN;
    const k = s.toLowerCase();
    return k in NUM_WORDS ? NUM_WORDS[k] : parseFloat(k.replace(',', '.'));
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function nextWeekday(now, idx, forceNext) {
    let diff = (idx - now.getDay() + 7) % 7;
    if (diff === 0 && forceNext) diff = 7;
    return addDays(startOfDay(now), diff);
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function cleanTitle(s) {
    return s
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/^[\s,.;:\-–—y]+|[\s,.;:\-–—]+$/giu, '')
      .replace(/(?:^|\s)(?:el|la|los|las|de|a|para|en|y|e)$/iu, '')
      .trim();
  }

  function guessCategory(text) {
    const t = ' ' + text.toLowerCase() + ' ';
    for (const [cat, words] of CAT_KEYWORDS) {
      for (const w of words) {
        if (rx(`${B}${w}${E}`).test(t)) return cat;
      }
    }
    return null;
  }

  const fold = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // "Jesus" -> patrón que también acepta "Jesús"
  function accentPattern(name) {
    const map = { a: '[aáà]', e: '[eéè]', i: '[iíì]', o: '[oóò]', u: '[uúùü]', n: '[nñ]' };
    return fold(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[aeioun]/g, (c) => map[c]);
  }

  // Busca a los hijos por su nombre (sin necesidad de @) o en grupo ("los niños", "ambos")
  function findKids(text, kids) {
    if (!kids || !kids.length) return [];
    if (rx(`${B}(?:los ni[ñn]os|mis hijos|los dos|ambos|los chicos|los muchachos)${E}`).test(text)) return kids.slice();
    return kids.filter((k) => rx(`${B}${accentPattern(k)}${E}`).test(text));
  }

  function resolveCategoryAlias(tag, customCats) {
    const t = tag.toLowerCase();
    for (const [cat, alts] of Object.entries(CAT_ALIASES)) if (alts.includes(t)) return cat;
    if (customCats) {
      const hit = customCats.find((c) => c.id.toLowerCase() === t || c.name.toLowerCase() === t);
      if (hit) return hit.id;
    }
    return null;
  }

  /**
   * Interpreta una frase. Devuelve una lista de recordatorios (normalmente uno;
   * varios cuando se dicta una lista de compras: "leche, pan y huevos").
   */
  function parse(input, opts) {
    opts = opts || {};
    const now = opts.now ? new Date(opts.now) : new Date();
    let s = ' ' + String(input || '').trim() + ' ';
    const out = { cat: null, person: null, repeat: null, date: null, time: null, hasTime: false };

    const take = (re, fn) => {
      const m = s.match(re);
      if (!m) return false;
      const keep = fn(m);
      if (keep !== false) s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
      return true;
    };

    // #categoria y @persona
    let tagRe = /#([\p{L}\d_-]+)/u;
    let m;
    while ((m = s.match(tagRe))) {
      const cat = resolveCategoryAlias(m[1], opts.categories);
      if (cat && !out.cat) out.cat = cat;
      s = s.slice(0, m.index) + ' ' + (cat ? '' : m[1]) + ' ' + s.slice(m.index + m[0].length);
    }
    // La persona se queda en el título ("firmar tarea de @sofi" -> "Firmar tarea de Sofi")
    const kids = opts.kids || [];
    m = s.match(/@([\p{L}\d_]+)/u);
    if (m) {
      const kid = kids.find((k) => fold(k) === fold(m[1]));
      out.person = kid || capitalize(m[1]);
      s = s.slice(0, m.index) + out.person + s.slice(m.index + m[0].length);
    }
    let kidFound = !!(m && kids.some((k) => k === out.person));
    if (!out.person) {
      const found = findKids(s, kids);
      if (found.length) {
        out.person = found.join(' y ');
        kidFound = true;
        // Escribir el nombre bien aunque se haya tecleado sin acento
        found.forEach((k) => { s = s.replace(rx(`${B}${accentPattern(k)}${E}`), k); });
      }
    }

    // Repeticiones
    let repeatWeekday = null;
    take(rx(`${B}(?:todos los|cada)\\s+(${WD_ALT})${E}`), (mm) => { out.repeat = 'weekly'; repeatWeekday = weekdayIndex(mm[1]); })
      || take(rx(`${B}(?:todos los d[ií]as|cada d[ií]a|diario|diariamente)${E}`), () => { out.repeat = 'daily'; })
      || take(rx(`${B}(?:entre semana|d[ií]as (?:laborables|h[aá]biles)|de lunes a viernes)${E}`), () => { out.repeat = 'weekdays'; })
      || take(rx(`${B}(?:cada semana|semanalmente|semanal|todas las semanas)${E}`), () => { out.repeat = 'weekly'; })
      || take(rx(`${B}(?:cada quince d[ií]as|quincenal(?:mente)?)${E}`), () => { out.repeat = 'biweekly'; })
      || take(rx(`${B}(?:cada mes|mensualmente|mensual|todos los meses)${E}`), () => { out.repeat = 'monthly'; })
      || take(rx(`${B}(?:cada a[ñn]o|anualmente|anual)${E}`), () => { out.repeat = 'yearly'; });

    // "en 20 minutos", "en dos horas", "en 3 días"
    let relative = null;
    take(rx(`${B}(?:en|dentro de)\\s+(\\d+(?:[.,]\\d+)?|${Object.keys(NUM_WORDS).join('|')})\\s+(minutos?|mins?|horas?|hrs?|d[ií]as?|semanas?)${E}`), (mm) => {
      const n = toNum(mm[1]);
      const unit = mm[2].toLowerCase();
      if (/^min/.test(unit)) relative = { ms: n * 60000 };
      else if (/^h/.test(unit)) relative = { ms: n * 3600000 };
      else if (/^d/.test(unit)) relative = { days: n };
      else relative = { days: n * 7 };
    }) || take(rx(`${B}en\\s+media\\s+hora${E}`), () => { relative = { ms: 30 * 60000 }; })
      || take(rx(`${B}en\\s+un\\s+rato${E}`), () => { relative = { ms: 60 * 60000 }; });

    // Hora
    let partOfDay = null;
    const setTime = (h, min, mer) => {
      h = parseInt(h, 10);
      min = min ? parseInt(min, 10) : 0;
      if (h > 23 || min > 59) return false;
      if (mer === 'h24') {
        // formato de 24 horas: se respeta tal cual
      } else if (mer) {
        mer = mer.toLowerCase().replace(/[.\s]/g, '');
        if (/^(pm|p|delatarde|delanoche)$/.test(mer) && h < 12) h += 12;
        if (/^(am|a|delamañana|delamanana|delamadrugada)$/.test(mer) && h === 12) h = 0;
      } else if (h >= 1 && h <= 7) {
        h += 12; // "a las 5" casi siempre es por la tarde
      }
      out.time = { h, min };
      out.hasTime = true;
      return true;
    };
    const MER = `(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|de la ${MANANA}|de la tarde|de la noche|de la madrugada)`;
    take(rx(`${B}(?:a\\s+)?(?:medio\\s?d[ií]a)${E}`), () => { out.time = { h: 12, min: 0 }; out.hasTime = true; })
      || take(rx(`${B}(?:a\\s+)?media\\s?noche${E}`), () => { out.time = { h: 23, min: 59 }; out.hasTime = true; })
      || take(rx(`${B}a\\s+la[s]?\\s+(\\d{1,2})(?:[:.h](\\d{2}))?(?:\\s*(?:hrs?|horas))?(?:\\s*(?:y\\s+media))?\\s*${MER}?(?![\\p{L}\\d])`), (mm) => {
        const ok = setTime(mm[1], mm[2], mm[3]);
        if (ok && /y\s+media/i.test(mm[0])) out.time.min = 30;
        return ok;
      })
      || take(rx(`${B}(\\d{1,2}):(\\d{2})\\s*${MER}?(?![\\p{L}\\d])`), (mm) => setTime(mm[1], mm[2], mm[3] || (parseInt(mm[1], 10) > 12 ? 'h24' : null)))
      || take(rx(`${B}(\\d{1,2})\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|hrs|horas)(?![\\p{L}\\d])`), (mm) => setTime(mm[1], null, /h/i.test(mm[2]) ? 'h24' : mm[2]));

    // Momento del día ("en la mañana", "esta noche")
    take(rx(`${B}(?:en|por|de) la (${MANANA}|tarde|noche)${E}`), (mm) => { partOfDay = mm[1].toLowerCase(); })
      || take(rx(`${B}(?:esta|hoy en la|hoy por la) (${MANANA}|tarde|noche)${E}`), (mm) => { partOfDay = mm[1].toLowerCase(); out.date = startOfDay(now); })
      || take(rx(`${B}(?:temprano)${E}`), () => { partOfDay = 'temprano'; });
    if (partOfDay && !out.hasTime) {
      const map = { tarde: 16, noche: 20, temprano: 7 };
      out.time = { h: map[partOfDay] != null ? map[partOfDay] : 9, min: 0 };
      out.hasTime = true;
    }

    // Fecha
    take(rx(`${B}pasado\\s+${MANANA}${E}`), () => { out.date = addDays(startOfDay(now), 2); })
      || take(rx(`${B}${MANANA}${E}`), () => { out.date = addDays(startOfDay(now), 1); })
      || take(rx(`${B}hoy${E}`), () => { out.date = startOfDay(now); })
      || take(rx(`${B}(?:el\\s+)?(?:pr[oó]ximo\\s+|este\\s+)?(${WD_ALT})(?:\\s+(?:que viene|pr[oó]ximo))?${E}`), (mm) => {
        out.date = nextWeekday(now, weekdayIndex(mm[1]), true);
      })
      || take(rx(`${B}(?:el\\s+)?(\\d{1,2})\\s*[/-]\\s*(\\d{1,2})(?:\\s*[/-]\\s*(\\d{2,4}))?${E}`), (mm) => {
        const d = parseInt(mm[1], 10), mo = parseInt(mm[2], 10) - 1;
        if (d < 1 || d > 31 || mo < 0 || mo > 11) return false;
        let y = mm[3] ? parseInt(mm[3], 10) : now.getFullYear();
        if (y < 100) y += 2000;
        let dt = new Date(y, mo, d);
        if (!mm[3] && dt < startOfDay(now)) dt = new Date(y + 1, mo, d);
        out.date = dt;
      })
      || take(rx(`${B}(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')})(?:\\s+(?:de|del)\\s+(\\d{4}))?${E}`), (mm) => {
        const d = parseInt(mm[1], 10);
        const mo = MONTHS.findIndex((x) => x.split('|').includes(mm[2].toLowerCase()));
        let y = mm[3] ? parseInt(mm[3], 10) : now.getFullYear();
        let dt = new Date(y, mo, d);
        if (!mm[3] && dt < startOfDay(now)) dt = new Date(y + 1, mo, d);
        out.date = dt;
      })
      || take(rx(`${B}(?:la\\s+)?(?:pr[oó]xima\\s+semana|semana\\s+que\\s+viene)${E}`), () => { out.date = nextWeekday(now, 1, true); });

    if (repeatWeekday != null && !out.date) out.date = nextWeekday(now, repeatWeekday, false);

    // Construir fecha final
    let due = null;
    if (relative) {
      due = relative.ms ? new Date(now.getTime() + relative.ms) : addDays(now, relative.days);
      if (relative.ms) { out.hasTime = true; }
      else if (out.time) { due.setHours(out.time.h, out.time.min, 0, 0); }
      else { out.hasTime = false; due = startOfDay(due); }
    } else if (out.date || out.time) {
      due = out.date ? new Date(out.date) : startOfDay(now);
      if (out.time) due.setHours(out.time.h, out.time.min, 0, 0);
      // Si solo dije la hora y ya pasó, es para mañana
      if (!out.date && out.time && due <= now) due = addDays(due, 1);
      if (!out.date && !out.time) due = null;
    } else if (out.repeat) {
      due = startOfDay(now);
      if (out.repeat === 'weekdays') while (due.getDay() === 0 || due.getDay() === 6) due = addDays(due, 1);
    }

    // Título y categoría
    let title = cleanTitle(s);
    // Persona elegida con los botones rápidos de la app
    if (!out.person && opts.person) {
      out.person = opts.person;
      kidFound = kids.some((k) => opts.person.split(/\s+y\s+/).includes(k));
    }

    // Lo que es de los hijos va a Escuela, salvo que la frase diga otra cosa
    let cat = out.cat || guessCategory(title) || (kidFound ? 'escuela' : null) || opts.defaultCat || 'personal';

    const base = { cat, person: out.person, repeat: out.repeat, due: due ? due.toISOString() : null, hasTime: !!(due && out.hasTime) };

    // Listas de compras: "leche, pan y huevos" -> 3 artículos
    if (cat === 'compras') {
      title = title.replace(rx(`^(?:(?:hay que|tengo que|necesito|falta|faltan|comprar|compra(?:r)?|ir a comprar|ir al s[uú]per (?:por|a comprar)?)\\s+)+`), '');
      title = title.replace(rx(`^(?:en el|del|al)\\s+s[uú]per(?:mercado)?\\s*`), '');
      const parts = title
        .split(/\s*[,;]\s*|\s+y\s+(?=\S)|\s+e\s+(?=[ií])/iu)
        .map(cleanTitle)
        .filter(Boolean);
      if (parts.length > 1 && !base.due) {
        return parts.map((p) => Object.assign({}, base, { title: capitalize(p) }));
      }
    }

    title = capitalize(title) || (cat === 'compras' ? 'Compras' : 'Recordatorio');
    return [Object.assign({}, base, { title })];
  }

  /** Calcula la siguiente fecha de una tarea que se repite. */
  function nextOccurrence(dueIso, repeat, now) {
    if (!dueIso || !repeat) return null;
    now = now ? new Date(now) : new Date();
    let d = new Date(dueIso);
    const step = (x) => {
      const y = new Date(x);
      switch (repeat) {
        case 'daily': y.setDate(y.getDate() + 1); break;
        case 'weekdays':
          do { y.setDate(y.getDate() + 1); } while (y.getDay() === 0 || y.getDay() === 6);
          break;
        case 'weekly': y.setDate(y.getDate() + 7); break;
        case 'biweekly': y.setDate(y.getDate() + 14); break;
        case 'monthly': {
          const day = new Date(dueIso).getDate();
          y.setDate(1); y.setMonth(y.getMonth() + 1);
          const last = new Date(y.getFullYear(), y.getMonth() + 1, 0).getDate();
          y.setDate(Math.min(day, last));
          break;
        }
        case 'yearly': y.setFullYear(y.getFullYear() + 1); break;
        default: return null;
      }
      return y;
    };
    d = step(d);
    // Si estaba muy atrasada, saltar hasta el futuro (máx. 1000 pasos por seguridad)
    for (let i = 0; d && d < now && i < 1000; i++) d = step(d);
    return d ? d.toISOString() : null;
  }

  const api = { parse, nextOccurrence, guessCategory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NSOParser = api;
})(typeof self !== 'undefined' ? self : this);
