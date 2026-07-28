# Rutas por el Monte

Catálogo personal de rutas de senderismo. PWA instalable, con filtros por dificultad,
exigencia, tipo de ruta, país, distancia y características, estadísticas globales y
funcionamiento sin conexión.

## Estructura

```
index.html                       página única de la app
css/styles.css                    estilos (tema oscuro por defecto + tema claro)
js/app.js                          toda la lógica: filtros, tarjetas, modales, tema, PWA, mapa
data/rutas.json                    datos de las rutas (NO hay datos hardcodeados en el código)
data/version.json                  metadata del despliegue: fecha de generación, nº de rutas, build
data/gpx/*.gpx                     tracks GPX descargables, uno por ruta validada
data/tracks/*.geojson              el mismo recorrido en GeoJSON, para dibujar en el mapa
scripts/build_data.py              convierte un CSV de rutas al data/rutas.json
scripts/merge_tracks.py            cruza tracks (GPX/GeoJSON) con data/rutas.json por id
scripts/datos_tracks_para_merge.json  fichero de cruce usado por merge_tracks.py
manifest.json                      manifiesto de la PWA
sw.js                               service worker (caché de app shell + datos + tracks, offline)
assets/icons/                       logo e iconos de la app
```

## Origen de los datos

Cada ruta tiene un campo `origen` que indica su procedencia:

- `"Wikiloc personal"` (por defecto): rutas ya grabadas o subidas a tu cuenta de Wikiloc.
- `"Oficial · <organismo>"` (p. ej. `"Oficial · Gobierno de Aragón"`): rutas importadas de
  un portal de datos abiertos público que todavía no se han subido a Wikiloc. Estas pueden
  llevar además un `fuente_url` con el enlace a la página o dataset oficial original.

En el modal de detalle esto se ve como una pastilla junto a dificultad/exigencia/trailrank,
y si hay `fuente_url` aparece un botón "Ver fuente oficial" junto a los de Wikiloc/YouTube.
La idea a medio plazo es que las rutas "Oficial · ..." acaben subiéndose a Wikiloc (pasando
así a `wikiloc_url` y `origen: "Wikiloc personal"`), de forma que esta web funcione como
repositorio/borrador propio antes de publicarlas.

## Actualizar las rutas

El JSON (`data/rutas.json`) es la fuente que consume la web. Para regenerarlo a partir
de un CSV con las mismas columnas que el original (`ruta_id, nombre, localidad, region,
pais, distancia_km, desnivel_positivo_m, desnivel_negativo_m, dificultad, exigencia,
duracion, duracion_min, tipo_ruta, altitud_maxima_m, altitud_minima_m, trailrank,
fecha_realizacion, caracteristicas, precauciones, descripcion, wikiloc_url, youtube_url,
youtube_disponible`), más dos columnas opcionales `origen` y `fuente_url` (si se omiten,
`origen` se rellena como `"Wikiloc personal"` y `fuente_url` queda vacío):

```bash
python3 scripts/build_data.py ruta_al_csv_actualizado.csv
```

Esto sobrescribe `data/rutas.json` y actualiza `data/version.json` (fecha de
generación y nº de rutas) automáticamente. `scripts/merge_tracks.py` también
lo actualiza al terminar. Luego solo falta commitear y subir el cambio.

## Versión de los datos

Junto al selector de tema (arriba a la derecha) hay un botón de engranaje
**⚙️ Ajustes**. Su modal muestra el build de la app, cuándo se generó
`data/rutas.json` por última vez y el nº de rutas, leyendo `data/version.json`
(sin tener que bajar hasta el pie de página). Si ese fichero no existe o
falla la petición (por ejemplo, una build muy antigua), el modal simplemente
muestra "—": nunca bloquea la app. Con el tiempo, este modal de Ajustes es
donde irán añadiéndose más opciones.

## Carga por lotes de las tarjetas (rendimiento con muchas rutas)

`data/rutas.json` se descarga entero siempre (hace falta para poder buscar y
filtrar sin conexión sobre las 273 rutas, y las que se añadan después), pero
`js/app.js` solo **pinta** un lote de `BATCH_SIZE` tarjetas (30) a la vez.
El resto se van añadiendo automáticamente al hacer scroll cerca del final de
la lista (`IntersectionObserver` sobre un sentinela invisible bajo la
cuadrícula), con un botón "Cargar más rutas" como alternativa manual/
accesible. Cambiar cualquier filtro, la búsqueda o el orden reinicia el lote
visible al primero. Esto evita que el primer render se ralentice al crecer
la colección (por ejemplo a ~500 rutas) sin renunciar a la búsqueda offline
sobre el conjunto completo.

## Mapa y recorrido (GPX/GeoJSON)

Cada ruta puede tener un track real asociado. El mapa está **embebido dentro del propio
modal de detalle** (no en una ventana ni botón aparte): al abrir "Ver detalle" de una ruta
que lo tiene, aparece una sección "Mapa y recorrido" con el track dibujado, y junto a los
enlaces de Wikiloc/YouTube se añaden "Cómo llegar al inicio" y "Descargar GPX". En la
tarjeta solo se ve un pequeño icono de mapa (igual que los de Wikiloc/YouTube) como aviso
de que esa ruta lo tiene. Esto ocurre solo cuando, a la vez:

- `mapa_habilitado === true`, y
- `estado_track === "VALIDADO"`.

El GeoJSON se carga con `fetch()` únicamente cuando se abre ese detalle (nunca se precargan
los 273 recorridos al iniciar la app). El mapa usa Leaflet 1.9.4 (versión fijada por CDN)
sobre mosaicos de OpenStreetMap, y la instancia se destruye (`map.remove()`) al cerrar o
sustituir el modal para no acumular mapas en memoria.

### Pendiente y perfil de elevación

- `pendiente_media_pct` (desnivel positivo / distancia total) se calcula para las 273
  rutas, tengan o no track real. Se muestra en el detalle; se probó también en la ficha
  (tarjeta) pero se quitó de ahí a petición del usuario.
- El **perfil de elevación** (gráfico SVG) y la `pendiente_maxima_pct` solo existen para
  las rutas con track (mismo requisito que el mapa): se calculan a partir del GeoJSON real
  con `scripts/route_metrics.py`, remuestreando el track cada 100 m y suavizando picos
  aislados de altitud (ruido típico del GPS en cuevas, cañones o bajo arbolado) antes de
  tomar el percentil 90 de las pendientes por tramo — así una lectura puntual mala del GPS
  no dispara el resultado a cifras irreales.
- El perfil de elevación en el detalle reutiliza el mismo GeoJSON que ya se descarga para
  el mapa: no hace una petición aparte.
- El gráfico es interactivo: al pasar el ratón (o el dedo, en móvil) sobre el perfil se ve
  una guía con la distancia y altitud exactas en ese punto, y aparece un marcador en el mapa
  de arriba mostrando dónde está ese punto del recorrido.

### Cómo se generan `data/gpx/` y `data/tracks/`

Estos archivos **no se generan a mano**: vienen de un proceso externo (extractor local +
validación) que produce un fichero de cruce (`scripts/datos_tracks_para_merge.json`) con,
para cada `id` de Wikiloc, el estado del track y las rutas de origen/destino de sus
archivos GPX/GeoJSON.

1. Copia los archivos validados desde tu biblioteca local al repo (herramienta externa al
   repo, no incluida aquí), dejándolos en `data/gpx/<archivo>.gpx` y
   `data/tracks/<archivo>.geojson` exactamente como indica el fichero de cruce.
2. Ejecuta el merge:

   ```bash
   python3 scripts/merge_tracks.py \
     --rutas data/rutas.json \
     --merge scripts/datos_tracks_para_merge.json \
     --repo-root .
   ```

3. El script cruza **exclusivamente por `id`** (texto, sin fuzzy matching), nunca toca los
   campos existentes de cada ruta (distancia, desnivel, duración, dificultad, exigencia,
   altitudes, descripción), y **verifica que los dos archivos (`track_gpx_destino` y
   `track_geojson_destino`) existan de verdad en el repo** antes de fijar
   `mapa_habilitado: true`. Si el fichero de cruce dice que una ruta está `VALIDADO` pero
   los archivos aún no están copiados, la deja como `estado_track: "PENDIENTE_ARCHIVOS"`
   y `mapa_habilitado: false`, sin inventar nada.
4. Genera `reporte_merge.json` con el detalle completo (cruzados, no encontrados,
   duplicados, pendientes de archivos, pendientes de revisión de nombre).

Puedes volver a ejecutar `merge_tracks.py` en cualquier momento (p. ej. según vayas
añadiendo archivos a `data/gpx/`/`data/tracks/`): es idempotente y solo activa el mapa de
las rutas cuyos dos archivos existan de verdad en ese momento.

## Desarrollo local

Al ser una PWA con service worker, no se puede abrir el `index.html` directamente con
`file://` (los service workers requieren HTTP). Basta un servidor estático simple:

```bash
python3 -m http.server 8080
```

y abrir `http://localhost:8080`.

## Despliegue

Pensado para servirse con GitHub Pages desde la raíz de `main`.

## Pendiente / roadmap

- 199 rutas ya tienen mapa activo (`VALIDADO` + archivos reales en `data/gpx/`/`data/tracks/`).
  Revisar a mano las 6 rutas `REVISAR_NOMBRE` (sus archivos ya están copiados, solo falta
  confirmar el nombre y cambiar su `estado_track` a `VALIDADO` en el fichero de cruce antes
  de volver a ejecutar `merge_tracks.py`).
- El modal de Ajustes (⚙️) es el sitio donde añadir más opciones de configuración a futuro.
- Cuentas de usuario (Google) para guardar favoritos y rutas ya realizadas.
