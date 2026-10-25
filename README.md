# 🔔 No Se Me Olvida

App de recordatorios para personas olvidadizas: **compras**, **escuela de los hijos**, **trabajo** y **pendientes personales**.
Se instala en el celular como una app (PWA), funciona **sin internet** y no necesita cuenta: todo se guarda en tu teléfono.

## Lo principal

| Función | Cómo se usa |
|---|---|
| ✍️ **Escribir como hablas** | `leche, pan y huevos` → 3 artículos en Compras · `firmar boleta de Jesús mañana 7am` · `junta con el jefe el jueves a las 4` |
| 🎤 **Dictar con voz** | Toca el micrófono y habla; se guarda solo al terminar |
| 🛒 **Lista del súper** | Casillas grandes para usar en la tienda, “Lo que sueles comprar” para volver a agregar en un toque, **Compartir lista** por WhatsApp |
| 🎒 **Escuela por hijo** | Escribe *Jesús*, *Julián* o *los niños* (con o sin acento) y se asigna solo; filtra los pendientes de cada uno o toca **Para: 👦 Jesús / 👦 Julián / Los dos** antes de escribir |
| 🔔 **Avisos** | Notificación a la hora (o antes: 10 min, 1 h, 1 día), con botones *Hecho* y *En 10 min* |
| 📅 **A tu calendario** | En cada recordatorio: “Agregar a mi calendario” (archivo .ics con alarma). Es el aviso más seguro, aunque la app esté cerrada |
| 🔁 **Repetir** | `cada martes`, `todos los días`, `entre semana`, `cada mes` |
| 📍 **Modo calle** | Guarda tu súper, la escuela o la oficina; con la app abierta te avisa al llegar con los pendientes de ese lugar |
| ⭐ **Hoy** | Vencidos y lo de hoy en una sola pantalla |
| 💾 **Copia de seguridad** | Descargar y restaurar desde ⚙️ Ajustes |

### Palabras que entiende
- **Para quién:** `Jesús`, `Julián`, `los niños` / `ambos` / `los dos`, o `@cualquiera`
- **Categoría:** `#compras` `#escuela` `#trabajo` `#casa` (o la adivina: *leche* → Compras, *tarea / maestra / uniforme* → Escuela, *reunión / cliente / reporte* → Trabajo, *pagar / cita / dentista* → Personal)
- **Día:** `hoy`, `mañana`, `pasado mañana`, `el viernes`, `15/11`, `3 de diciembre`, `la próxima semana`, `en 3 días`
- **Hora:** `a las 5` (se entiende 5 p.m.), `7am`, `18:30`, `a las 8 de la mañana`, `a mediodía`, `en la noche`, `en 20 minutos`

## Publicación (GitHub Pages)

La app se publica sola con `.github/workflows/pages.yml` cada vez que se sube algo a `main`:
primero corre las pruebas y luego actualiza la página.

**Dirección de la app:** https://pardaillan4-alt.github.io/No-se-me-olvida/

Activación (una sola vez):
1. El repositorio debe ser **público** (GitHub Pages gratis lo pide; ver *Privacidad* abajo).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. En **Actions**, abre “Publicar app” y toca **Re-run all jobs** (o sube cualquier cambio).
   Cuando salga la palomita verde, la app ya está en la dirección de arriba.

### Privacidad
- Tus recordatorios **nunca** se suben a internet: viven solo en tu teléfono.
- En el código solo aparecen los **nombres de pila** de los niños (`config.js`), que sirven para reconocerlos al escribir.
  Si el repositorio es público, cualquiera puede verlos. Si prefieres que no, deja `kids: []` en `config.js`
  y agrégalos desde ⚙️ Ajustes → Mis hijos (así se quedan solo en tu teléfono).

## Usarla en el celular

1. Abre https://pardaillan4-alt.github.io/No-se-me-olvida/ en el celular:
   - **Android (Chrome):** menú ⋮ → *Instalar app* / *Agregar a pantalla principal*.
   - **iPhone (Safari):** botón Compartir → *Agregar a inicio*. (En iPhone las notificaciones solo funcionan con la app instalada así, iOS 16.4 o más reciente.)
2. Abre la app, agrega algo con hora y toca **Activar** cuando pregunte por los avisos.

> **Importante sobre los avisos:** una app web no puede despertar al teléfono por sí sola si está totalmente cerrada.
> Avisa a la hora mientras esté abierta o en segundo plano, y al abrirla muestra lo vencido.
> Para lo que no puede fallar (juntas, pagos, citas) usa **📅 Agregar a mi calendario**: la alarma la da el calendario del teléfono.

## Para desarrollo

Sin dependencias ni compilación: HTML + CSS + JavaScript.

```bash
npm start   # sirve la app en http://localhost:8080
npm test    # pruebas del intérprete de frases (Node 18+)
```

| Archivo | Qué hace |
|---|---|
| `index.html`, `styles.css` | Interfaz (móvil primero, modo oscuro automático) |
| `app.js` | Lista, avisos, voz, lugares, calendario, copias |
| `parser.js` | Entiende frases en español (fechas, horas, categorías, listas, nombres de los hijos) |
| `config.js` | Nombres de los hijos que vienen de inicio |
| `.github/workflows/pages.yml` | Pruebas + publicación automática en GitHub Pages |
| `sw.js` | Funcionamiento sin internet y botones de las notificaciones |
| `tests/` | Pruebas del intérprete |
