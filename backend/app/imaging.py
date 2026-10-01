"""NRRD reading, slice PNG encoding, checksums and mask-payload decoding.

Axis convention (DR-008a, contract index_convention ``x=column,y=row,z=slice``):
pynrrd returns NRRD data in (x, y, z) order. A served slice z is the 2-D array
``data[:, :, z].T`` of shape (Ny, Nx): row = y, column = x, top-left origin.
Volumes held in memory here are (z, y, x), so slice z is simply ``vol[z]``.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import io
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from PIL import Image

from .contract import ApiError

RENDER_VERSION = "png8-identity/1"  # uint8 intensities copied unchanged; no window, no resample
MASK_RENDER_VERSION = "png8-mask-0-255/1"


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_nrrd(path: Path) -> Tuple[np.ndarray, dict]:
    import nrrd  # imported lazily: only ingestion and prediction loading need it

    data, header = nrrd.read(str(path))
    if data.ndim != 3:
        raise ValueError(f"{path}: expected a 3-D NRRD, got {data.ndim}-D")
    return data, header


def to_zyx(data_xyz: np.ndarray) -> np.ndarray:
    return np.ascontiguousarray(np.transpose(data_xyz, (2, 1, 0)))


def geometry_from_header(header: dict) -> Dict[str, object]:
    """Spacing/origin/direction exactly as the header states them.

    The values are reported, never trusted: geometry_validation_status stays
    GEOMETRY_NOT_VALIDATED (QA-002 F2: every LASC header is the default affine).
    """
    directions = np.asarray(header.get("space directions"), dtype=float)
    if directions.shape != (3, 3) or not np.all(np.isfinite(directions)):
        raise ValueError("space directions missing or not 3x3")
    spacing = np.linalg.norm(directions, axis=1)
    if np.any(spacing <= 0):
        raise ValueError("zero-length space direction")
    unit = directions / spacing[:, None]
    off_diagonal = unit - np.diag(np.diag(unit))
    axis_aligned = bool(np.all(np.abs(off_diagonal) < 1e-6))
    origin = np.asarray(header.get("space origin", [0.0, 0.0, 0.0]), dtype=float)
    default_header = bool(
        np.allclose(spacing, 1.0) and np.allclose(origin, 0.0) and np.allclose(unit, np.eye(3))
    )
    return {
        "spacing": [float(v) for v in spacing],
        "origin": [float(v) for v in origin],
        "direction": [float(v) for v in unit.reshape(-1)],
        "axis_aligned": axis_aligned,
        "default_header": default_header,
    }


def encode_png(slice_yx: np.ndarray) -> bytes:
    if slice_yx.dtype != np.uint8 or slice_yx.ndim != 2:
        raise ValueError("a served slice is a 2-D uint8 array")
    buffer = io.BytesIO()
    Image.fromarray(slice_yx).save(buffer, format="PNG", compress_level=6)
    return buffer.getvalue()


def decode_png(payload: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(payload)) as image:
        if image.mode not in {"L", "1", "P"}:
            image = image.convert("L")
        return np.asarray(image.convert("L"), dtype=np.uint8)


def binary_mask(volume: np.ndarray) -> np.ndarray:
    """Any non-zero voxel is foreground; served masks are exactly {0, 255}."""
    return np.where(volume != 0, 255, 0).astype(np.uint8)


def volume_checksum(volume_zyx: np.ndarray) -> str:
    """sha256 over the uint8 (z, y, x) C-order bytes of a {0, 255} mask volume."""
    return "sha256:" + sha256_bytes(np.ascontiguousarray(volume_zyx, dtype=np.uint8).tobytes())


def decode_mask_payload(payload: object, ny: int, nx: int, encodings: List[str]) -> np.ndarray:
    """Decode a working-mask slice; raises the contract code a client can act on."""
    if not isinstance(payload, dict) or set(payload) != {"encoding", "data"}:
        raise ApiError("VALIDATION_ERROR", {"field": "mask_payload", "expected": ["encoding", "data"]})
    encoding, data = payload["encoding"], payload["data"]
    if encoding not in encodings or not isinstance(data, str):
        raise ApiError("VALIDATION_ERROR", {"field": "mask_payload.encoding", "allowed": encodings})
    try:
        raw = base64.b64decode(data.encode("ascii"), validate=True)
    except (binascii.Error, UnicodeEncodeError):
        raise ApiError("VALIDATION_ERROR", {"field": "mask_payload.data", "reason": "not base64"})
    if encoding == "BITPACK_BASE64":
        expected = (ny * nx + 7) // 8
        if len(raw) != expected:
            raise ApiError("GEOMETRY_MISMATCH", {"field": "mask_payload", "expected_bytes": expected, "got": len(raw)})
        bits = np.unpackbits(np.frombuffer(raw, dtype=np.uint8), bitorder="big")[: ny * nx]
        return (bits.reshape(ny, nx) * 255).astype(np.uint8)
    try:
        image = decode_png(raw)
    except Exception:
        raise ApiError("VALIDATION_ERROR", {"field": "mask_payload.data", "reason": "not a PNG"})
    if image.shape != (ny, nx):
        raise ApiError("GEOMETRY_MISMATCH", {"field": "mask_payload", "expected_shape_yx": [ny, nx], "got": list(image.shape)})
    values = set(np.unique(image).tolist())
    if not values <= {0, 255}:
        raise ApiError("VALIDATION_ERROR", {"field": "mask_payload", "reason": "mask values must be {0, 255}"})
    return image.astype(np.uint8)


def encode_bitpack(slice_yx: np.ndarray) -> str:
    """Inverse of BITPACK_BASE64 decoding (used by tests and clients alike)."""
    bits = (np.asarray(slice_yx) != 0).astype(np.uint8).reshape(-1)
    return base64.b64encode(np.packbits(bits, bitorder="big").tobytes()).decode("ascii")
