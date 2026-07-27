#!/usr/bin/env python3
"""
Cruza datos_tracks_para_merge.json con data/rutas.json EXCLUSIVAMENTE por id (texto,
comparación exacta). No hace fuzzy matching. No modifica ninguno de los campos
existentes de rutas.json (distancia, desnivel, duración, dificultad, exigencia,
altitudes, descripción...). Solo añade campos nuevos relacionados con el mapa/track.

mapa_habilitado se fija a true SOLO si:
  - el merge file dice mapa_habilitado=true y estado_track=="VALIDADO", Y
  - los dos ficheros (track_gpx_destino y track_geojson_destino) existen de verdad
    dentro del repo en el momento de ejecutar este script.

Si el merge dice que debería haber mapa pero los ficheros no existen en el repo,
se marca estado_track="PENDIENTE_ARCHIVOS" y mapa_habilitado=false, y se reporta
como advertencia (no se inventa ni se fuerza nada).

Uso:
  python3 merge_tracks.py --rutas data/rutas.json --merge datos_tracks_para_merge.json --repo-root .
"""
import argparse
import json
import sys
from pathlib import Path

NO_SOBRESCRIBIR = {
    "distancia_km", "desnivel_positivo_m", "desnivel_negativo_m",
    "duracion_texto", "duracion_min", "dificultad", "exigencia",
    "altitud_maxima_m", "altitud_minima_m", "descripcion",
}

CAMPOS_MAPA = [
    "estado_track", "track_disponible", "mapa_habilitado",
    "track_geojson", "track_gpx",
    "latitud_origen", "longitud_origen", "latitud_final", "longitud_final",
    "mapa_origen_url",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rutas", required=True, type=Path)
    ap.add_argument("--merge", required=True, type=Path)
    ap.add_argument("--repo-root", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=None, help="por defecto sobrescribe --rutas")
    args = ap.parse_args()

    rutas = json.loads(args.rutas.read_text(encoding="utf-8"))
    merge_doc = json.loads(args.merge.read_text(encoding="utf-8"))
    merge_rutas = merge_doc["rutas"]

    # --- 1. Duplicados dentro del propio fichero de merge ---
    merge_ids = [str(r["id"]) for r in merge_rutas]
    dup_merge = sorted({i for i in merge_ids if merge_ids.count(i) > 1})

    # --- 2. Índice por id (string, exacto) ---
    merge_by_id = {}
    for r in merge_rutas:
        rid = str(r["id"])
        merge_by_id.setdefault(rid, []).append(r)

    rutas_ids = [str(r["id"]) for r in rutas]
    dup_rutas = sorted({i for i in rutas_ids if rutas_ids.count(i) > 1})

    encontrados = []          # ids de rutas.json con entrada en merge
    no_encontrados_en_rutas = []   # ids del merge que no existen en rutas.json
    rutas_sin_entrada_merge = []   # ids de rutas.json sin entrada en el merge
    habilitados_reales = []
    pendientes_archivos = []       # decia VALIDADO pero faltan ficheros de verdad
    pendientes_revision = []       # REVISAR_NOMBRE
    sin_track = []                 # SIN_TRACK / SIN_ENTRADA_BLOG
    discrepancias_wikiloc = []

    rutas_por_id = {str(r["id"]): r for r in rutas}

    for rid, ruta in rutas_por_id.items():
        entradas = merge_by_id.get(rid)
        if not entradas:
            rutas_sin_entrada_merge.append(rid)
            continue
        if len(entradas) > 1:
            # ya reportado en dup_merge; no se toca esta ruta para no arriesgar
            continue
        m = entradas[0]
        encontrados.append(rid)

        # verificación de discrepancia de wikiloc_url (solo diagnóstico, no bloquea)
        if m.get("wikiloc_url") and ruta.get("wikiloc_url") and m["wikiloc_url"] != ruta["wikiloc_url"]:
            discrepancias_wikiloc.append({
                "id": rid, "rutas_json": ruta.get("wikiloc_url"), "merge": m.get("wikiloc_url"),
            })

        estado = m.get("estado_track")
        mapa_habilitado_merge = bool(m.get("mapa_habilitado"))

        gpx_destino = m.get("track_gpx_destino")
        geojson_destino = m.get("track_geojson_destino")

        gpx_existe = bool(gpx_destino) and (args.repo_root / gpx_destino).is_file()
        geojson_existe = bool(geojson_destino) and (args.repo_root / geojson_destino).is_file()

        mapa_habilitado_final = mapa_habilitado_merge and estado == "VALIDADO" and gpx_existe and geojson_existe

        if mapa_habilitado_merge and estado == "VALIDADO" and not (gpx_existe and geojson_existe):
            pendientes_archivos.append({
                "id": rid, "nombre": ruta.get("nombre"),
                "track_gpx_destino": gpx_destino, "gpx_existe": gpx_existe,
                "track_geojson_destino": geojson_destino, "geojson_existe": geojson_existe,
            })
            estado_final = "PENDIENTE_ARCHIVOS"
        else:
            estado_final = estado

        if estado == "REVISAR_NOMBRE":
            pendientes_revision.append(rid)
        if estado in ("SIN_TRACK", "SIN_ENTRADA_BLOG"):
            sin_track.append(rid)
        if mapa_habilitado_final:
            habilitados_reales.append(rid)

        # --- aplicar campos nuevos sin tocar los protegidos ---
        nuevos = {
            "estado_track": estado_final,
            "track_disponible": bool(m.get("track_disponible")),
            "mapa_habilitado": mapa_habilitado_final,
            "track_geojson": geojson_destino if geojson_existe else None,
            "track_gpx": gpx_destino if gpx_existe else None,
            "latitud_origen": m.get("latitud_origen"),
            "longitud_origen": m.get("longitud_origen"),
            "latitud_final": m.get("latitud_final"),
            "longitud_final": m.get("longitud_final"),
            "mapa_origen_url": m.get("mapa_origen_url"),
        }
        for k, v in nuevos.items():
            if k in NO_SOBRESCRIBIR:
                raise RuntimeError(f"Intento de sobrescribir campo protegido: {k}")
            ruta[k] = v

    for rid in merge_by_id:
        if rid not in rutas_por_id:
            no_encontrados_en_rutas.append(rid)

    if args.out is None:
        args.out = args.rutas
    args.out.write_text(json.dumps(rutas, ensure_ascii=False, indent=2), encoding="utf-8")

    reporte = {
        "total_rutas_json": len(rutas),
        "total_merge": len(merge_rutas),
        "ids_cruzados_correctamente": len(encontrados),
        "ids_merge_no_encontrados_en_rutas_json": no_encontrados_en_rutas,
        "rutas_json_sin_entrada_en_merge": rutas_sin_entrada_merge,
        "duplicados_en_merge": dup_merge,
        "duplicados_en_rutas_json": dup_rutas,
        "mapa_habilitado_real_tras_verificar_ficheros": len(habilitados_reales),
        "pendientes_por_archivos_faltantes": pendientes_archivos,
        "pendientes_revision_nombre": pendientes_revision,
        "sin_track_o_sin_entrada_blog": len(sin_track),
        "discrepancias_wikiloc_url": discrepancias_wikiloc,
    }
    Path("reporte_merge.json").write_text(json.dumps(reporte, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(reporte, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
