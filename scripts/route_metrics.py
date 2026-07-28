#!/usr/bin/env python3
"""
Métricas derivadas, sin datos nuevos: se calculan a partir de campos que
ya existen (distancia_km, desnivel_positivo_m) o del propio GeoJSON de la
ruta. No sustituyen ni tocan ningún campo curado/protegido.
"""
import json
import math
from pathlib import Path


def pendiente_media_pct(distancia_km, desnivel_positivo_m):
    """Pendiente media de toda la ruta: desnivel positivo / distancia total.
    Es una aproximación (no distingue tramos llanos de rampas), pero es la
    misma que usan la mayoría de apps de senderismo para este dato y no
    requiere el track real, así que está disponible para las 273 rutas."""
    if not distancia_km or distancia_km <= 0 or desnivel_positivo_m is None:
        return None
    return round(desnivel_positivo_m / (distancia_km * 1000) * 100, 1)


def _haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _despike_elevations(eles, window=2, threshold_m=12.0):
    """Sustituye picos aislados de altitud (típicos de GPS bajo árboles, en
    cuevas, cañones o junto a cascadas) por la mediana local. Un cambio de
    altitud real ocurre de forma gradual a lo largo de varios puntos, así que
    esto no borra desniveles genuinos, solo los saltos puntuales de un único
    trackpoint."""
    n = len(eles)
    out = list(eles)
    for i in range(n):
        lo, hi = max(0, i - window), min(n, i + window + 1)
        vecinos = eles[lo:i] + eles[i + 1:hi]
        if not vecinos:
            continue
        vecinos = sorted(vecinos)
        mediana = vecinos[len(vecinos) // 2]
        if abs(eles[i] - mediana) > threshold_m:
            out[i] = mediana
    return out


def pendiente_maxima_pct(geojson_path: Path, resample_m: float = 100.0, percentil: float = 0.9):
    """Pendiente máxima "sostenida" sobre el track real (GeoJSON), no la
    pendiente instantánea entre dos trackpoints (el GPS de móvil tiene
    suficiente ruido de altitud como para que eso dispare cifras absurdas,
    sobre todo en cuevas/cañones/bajo arbolado). Para evitarlo:
      1. Suaviza picos aislados de altitud (`_despike_elevations`).
      2. Remuestrea el perfil cada `resample_m` metros (interpolación lineal).
      3. Devuelve el percentil 90 de las pendientes por tramo, no el máximo
         absoluto, para que un único tramo anómalo residual no lo decida todo.
    """
    try:
        data = json.loads(Path(geojson_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    coords = None
    for feat in data.get("features") or []:
        geom = feat.get("geometry") or {}
        if geom.get("type") == "LineString":
            coords = geom.get("coordinates")
            break
    if not coords or len(coords) < 2:
        return None
    if any(len(c) < 3 or c[2] is None for c in coords[:5]):
        return None  # el track no trae elevación

    eles_raw = [c[2] for c in coords]
    eles = _despike_elevations(eles_raw)

    cum = [0.0]
    for i in range(1, len(coords)):
        lon1, lat1 = coords[i - 1][0], coords[i - 1][1]
        lon2, lat2 = coords[i][0], coords[i][1]
        cum.append(cum[-1] + _haversine_m(lat1, lon1, lat2, lon2))

    total = cum[-1]
    if total < resample_m * 2:
        return None

    slopes = []
    j = 0
    prev_ele, prev_d = eles[0], 0.0
    target = resample_m
    while target <= total:
        while j < len(cum) - 1 and cum[j + 1] < target:
            j += 1
        if j >= len(cum) - 1:
            break
        d0, d1 = cum[j], cum[j + 1]
        e0, e1 = eles[j], eles[j + 1]
        frac = 0 if d1 == d0 else (target - d0) / (d1 - d0)
        ele = e0 + (e1 - e0) * frac
        dd = target - prev_d
        if dd > 0:
            slopes.append(abs(ele - prev_ele) / dd * 100)
        prev_ele, prev_d = ele, target
        target += resample_m

    if not slopes:
        return None
    slopes.sort()
    idx = min(len(slopes) - 1, max(0, int(len(slopes) * percentil)))
    return round(slopes[idx], 1)
