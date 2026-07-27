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
