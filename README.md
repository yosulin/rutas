# Rutas por el Monte

Catálogo personal de rutas de senderismo. PWA instalable, con filtros por dificultad,
exigencia, tipo de ruta, país, distancia y características, estadísticas globales y
funcionamiento sin conexión.

## Estructura

```
index.html            página única de la app
css/styles.css         estilos (tema oscuro por defecto + tema claro)
js/app.js               toda la lógica: filtros, tarjetas, modales, tema, PWA
data/rutas.json         datos de las rutas (NO hay datos hardcodeados en el código)
scripts/build_data.py   convierte un CSV de rutas al data/rutas.json
manifest.json           manifiesto de la PWA
sw.js                    service worker (caché de app shell + datos, offline)
assets/icons/            logo e iconos de la app
```

## Actualizar las rutas

El JSON (`data/rutas.json`) es la fuente que consume la web. Para regenerarlo a partir
de un CSV con las mismas columnas que el original (`ruta_id, nombre, localidad, region,
pais, distancia_km, desnivel_positivo_m, desnivel_negativo_m, dificultad, exigencia,
duracion, duracion_min, tipo_ruta, altitud_maxima_m, altitud_minima_m, trailrank,
fecha_realizacion, caracteristicas, precauciones, descripcion, wikiloc_url, youtube_url,
youtube_disponible`):

```bash
python3 scripts/build_data.py ruta_al_csv_actualizado.csv
```

Esto sobrescribe `data/rutas.json`. Luego solo falta commitear y subir el cambio.

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

- Mapa con los puntos de inicio de cada ruta (POIs).
- Cuentas de usuario (Google) para guardar favoritos y rutas ya realizadas.
