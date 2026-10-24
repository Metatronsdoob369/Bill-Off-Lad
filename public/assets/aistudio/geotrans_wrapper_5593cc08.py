#!/usr/bin/env python3
"""Thin ctypes wrapper around the local GEOTRANS bridge dylib.

This module intentionally speaks to a small C bridge rather than the C++
GEOTRANS classes directly. The bridge owns the C++ object lifecycle and
exposes a plain C ABI that Python can call safely.
"""

from __future__ import annotations

import ctypes
import os
from pathlib import Path
from typing import Any, Tuple

try:
    from pyproj import Transformer
    _PYPROJ_AVAILABLE = True
except Exception:
    Transformer = None  # type: ignore[assignment]
    _PYPROJ_AVAILABLE = False


import platform

_LOCAL_DATA = Path(__file__).parent / "data"
_GEOTRANS_ROOT = os.path.expanduser(os.getenv("GEOTRANS_ROOT", "~/geotrans-3.10.2"))

if _LOCAL_DATA.is_dir():
    os.environ.setdefault("MSPCCS_DATA", str(_LOCAL_DATA))
elif Path("/srv/repos/geotrans/data").is_dir():
    os.environ.setdefault("MSPCCS_DATA", "/srv/repos/geotrans/data")
else:
    os.environ.setdefault("MSPCCS_DATA", os.path.join(_GEOTRANS_ROOT, "data"))

if platform.system() == "Darwin":
    _DEFAULT_BRIDGE_NAME = "libgeotrans_bridge.dylib"
elif platform.system() == "Windows":
    _DEFAULT_BRIDGE_NAME = "geotrans_bridge.dll"
else:
    _DEFAULT_BRIDGE_NAME = "libgeotrans_bridge.so"

_DEFAULT_BRIDGE = Path(__file__).with_name(_DEFAULT_BRIDGE_NAME)
_BRIDGE_PATH = Path(os.getenv("GEOTRANS_BRIDGE_LIB", str(_DEFAULT_BRIDGE))).expanduser()


def _load_bridge() -> ctypes.CDLL:
    if not _BRIDGE_PATH.exists():
        raise FileNotFoundError(
            f"GEOTRANS bridge not found at {_BRIDGE_PATH}. "
            f"Build {_DEFAULT_BRIDGE_NAME} before importing geotrans_wrapper."
        )

    lib = ctypes.CDLL(str(_BRIDGE_PATH))

    lib.geotrans_last_error.restype = ctypes.c_char_p

    lib.geotrans_wgs84_to_utm.argtypes = [
        ctypes.c_double,
        ctypes.c_double,
        ctypes.POINTER(ctypes.c_double),
        ctypes.POINTER(ctypes.c_double),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_char),
        ctypes.c_size_t,
    ]
    lib.geotrans_wgs84_to_utm.restype = ctypes.c_int

    lib.geotrans_wgs84_to_mgrs.argtypes = [
        ctypes.c_double,
        ctypes.c_double,
        ctypes.POINTER(ctypes.c_char),
        ctypes.c_size_t,
        ctypes.POINTER(ctypes.c_int),
    ]
    lib.geotrans_wgs84_to_mgrs.restype = ctypes.c_int

    lib.geotrans_utm_to_wgs84.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_double,
        ctypes.c_double,
        ctypes.POINTER(ctypes.c_double),
        ctypes.POINTER(ctypes.c_double),
    ]
    lib.geotrans_utm_to_wgs84.restype = ctypes.c_int

    lib.geotrans_mgrs_to_wgs84.argtypes = [
        ctypes.c_char_p,
        ctypes.POINTER(ctypes.c_double),
        ctypes.POINTER(ctypes.c_double),
    ]
    lib.geotrans_mgrs_to_wgs84.restype = ctypes.c_int

    lib.geotrans_geodetic_to_geodetic.argtypes = [
        ctypes.c_char_p,
        ctypes.c_char_p,
        ctypes.c_double,
        ctypes.c_double,
        ctypes.c_double,
        ctypes.POINTER(ctypes.c_double),
        ctypes.POINTER(ctypes.c_double),
        ctypes.POINTER(ctypes.c_double),
    ]
    lib.geotrans_geodetic_to_geodetic.restype = ctypes.c_int

    return lib


_LIB = _load_bridge()


def _raise_last_error(prefix: str) -> None:
    message = _LIB.geotrans_last_error()
    detail = message.decode("utf-8", "replace") if message else "unknown GEOTRANS error"
    raise RuntimeError(f"{prefix}: {detail}")


def wgs84_to_utm(lat_deg: float, lon_deg: float) -> Tuple[int, str, float, float]:
    easting = ctypes.c_double()
    northing = ctypes.c_double()
    zone = ctypes.c_int()
    hemisphere = ctypes.create_string_buffer(2)

    rc = _LIB.geotrans_wgs84_to_utm(
        float(lat_deg),
        float(lon_deg),
        ctypes.byref(easting),
        ctypes.byref(northing),
        ctypes.byref(zone),
        hemisphere,
        ctypes.sizeof(hemisphere),
    )
    if rc != 0:
        _raise_last_error("wgs84_to_utm failed")

    return zone.value, hemisphere.value.decode("ascii"), easting.value, northing.value


def wgs84_to_mgrs(lat_deg: float, lon_deg: float) -> Tuple[str, int]:
    mgrs = ctypes.create_string_buffer(32)
    precision = ctypes.c_int()

    rc = _LIB.geotrans_wgs84_to_mgrs(
        float(lat_deg),
        float(lon_deg),
        mgrs,
        ctypes.sizeof(mgrs),
        ctypes.byref(precision),
    )
    if rc != 0:
        _raise_last_error("wgs84_to_mgrs failed")

    return mgrs.value.decode("ascii"), precision.value


def utm_to_wgs84(zone: int, hemisphere: str, easting: float, northing: float) -> Tuple[float, float]:
    lat = ctypes.c_double()
    lon = ctypes.c_double()
    hemi = hemisphere.encode("ascii")[:1]

    rc = _LIB.geotrans_utm_to_wgs84(
        int(zone),
        hemi,
        float(easting),
        float(northing),
        ctypes.byref(lat),
        ctypes.byref(lon),
    )
    if rc != 0:
        _raise_last_error("utm_to_wgs84 failed")

    return lat.value, lon.value


def mgrs_to_wgs84(mgrs: str) -> Tuple[float, float]:
    lat = ctypes.c_double()
    lon = ctypes.c_double()

    rc = _LIB.geotrans_mgrs_to_wgs84(
        mgrs.encode("ascii"),
        ctypes.byref(lat),
        ctypes.byref(lon),
    )
    if rc != 0:
        _raise_last_error("mgrs_to_wgs84 failed")

    return lat.value, lon.value


def _resolve_datum_code(code: str) -> str:
    normalized = code.strip().upper().replace(" ", "").replace("-", "")
    if normalized == "WGS84":
        return "WGE"
    if normalized in ("NAD83", "NAD1983", "NAR", "NARC", "NAD83CONUS"):
        return "NAR-C"
    if normalized in ("NAD27", "NAD1927", "NAS", "NASC", "NAD27CONUS"):
        return "NAS-C"
    return code.strip().upper()


def geodetic_to_geodetic(
    source_datum: str,
    *args: Any,
) -> Tuple[float, float, float]:
    if len(args) == 3:
        if isinstance(args[0], str):
            target_datum, lat_deg, lon_deg = args
            height_m = 0.0
        else:
            lat_deg, lon_deg, target_datum = args
            height_m = 0.0
    elif len(args) == 4:
        if isinstance(args[0], str):
            target_datum, lat_deg, lon_deg, height_m = args
        else:
            lat_deg, lon_deg, target_datum, height_m = args
    else:
        raise TypeError(
            "geodetic_to_geodetic expects either "
            "(source_datum, target_datum, lat_deg, lon_deg, height_m) or "
            "(source_datum, lat_deg, lon_deg, target_datum, height_m)"
        )

    source_code = _resolve_datum_code(str(source_datum))
    target_code = _resolve_datum_code(str(target_datum))

    out_lat = ctypes.c_double()
    out_lon = ctypes.c_double()
    out_height = ctypes.c_double()

    rc = _LIB.geotrans_geodetic_to_geodetic(
        source_code.encode("ascii"),
        target_code.encode("ascii"),
        float(lat_deg),
        float(lon_deg),
        float(height_m),
        ctypes.byref(out_lat),
        ctypes.byref(out_lon),
        ctypes.byref(out_height),
    )
    if rc != 0:
        if (
            _PYPROJ_AVAILABLE
            and source_code == "NAD83"
            and target_code == "WGE"
        ):
            transformer = Transformer.from_crs("EPSG:4269", "EPSG:4326", always_xy=True)
            nlon, nlat = transformer.transform(float(lon_deg), float(lat_deg))
            return nlat, nlon, float(height_m)
        _raise_last_error("geodetic_to_geodetic failed")

    return out_lat.value, out_lon.value, out_height.value


__all__ = [
    "geodetic_to_geodetic",
    "mgrs_to_wgs84",
    "utm_to_wgs84",
    "wgs84_to_mgrs",
    "wgs84_to_utm",
]
