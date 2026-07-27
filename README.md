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

Esto sobrescribe `data/rutas.json`. Luego solo falta commitear y subir el cambio.

## Mapa y recorrido (GPX/GeoJSON)

Cada ruta puede tener un track real asociado. El botón **«Ver mapa y recorrido»** (en la
tarjeta y en el modal de detalle) solo aparece cuando, a la vez:

- `mapa_habilitado === true`, y
- `estado_track === "VALIDADO"`.

El GeoJSON se carga con `fetch()` únicamente cuando se abre ese mapa (nunca se precargan
los 273 recorridos al iniciar la app). El mapa usa Leaflet 1.9.4 (versión fijada por CDN)
sobre mosaicos de OpenStreetMap, y la instancia se destruye (`map.remove()`) al cerrar o
sustituir el modal para no acumular mapas en memoria.

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

- Copiar a `data/gpx/` y `data/tracks/` los archivos de las 199 rutas marcadas como
  `PENDIENTE_ARCHIVOS` y volver a ejecutar `merge_tracks.py` para activar sus mapas.
- Revisar a mano las 6 rutas `REVISAR_NOMBRE` antes de decidir si se activan.
- Cuentas de usuario (Google) para guardar favoritos y rutas ya realizadas.
