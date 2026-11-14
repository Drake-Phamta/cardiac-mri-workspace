"""GET /health and the immutable artifact bytes behind every content_url."""

from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.responses import Response

from .. import __version__, imaging
from ..meshes import ERRORS_MEDIA_TYPE, MEDIA_TYPE as MESH_MEDIA_TYPE
from ..state import Backend
from ..storage import now
from .common import ARTIFACT_NAME, error


def add_routes(app: FastAPI, backend: Backend) -> None:
    contract, settings = backend.contract, backend.settings
    cases, experiments, storage = backend.cases, backend.experiments, backend.storage
    base = contract.base_path

    @app.get("/health")
    def health() -> Dict[str, Any]:
        return {
            "status": "ok",
            "service": "cardiac-mri-backend",
            "version": __version__,
            "contract_version": contract.version,
            "geometry_contract_version": contract.geometry_version,
            "study_id": settings.study_id,
            "data_ready": bool(cases.cases),
            "cases": cases.counts(),
            "experiments": len(experiments.experiments),
            "runs": len(experiments.runs),
            "rejected_experiment_packages": [item["code"] for item in experiments.rejected],
            "storage": storage.counts(),
            "time": now(),
        }

    @app.get(f"{base}/artifacts/{{name}}")
    def artifact(name: str) -> Response:
        match = ARTIFACT_NAME.fullmatch(name)
        if not match:
            return error(contract, "ARTIFACT_NOT_FOUND", {"artifact": name})
        digest = match.group(1)
        if match.group(2) in ("cmesh", "json"):
            # A derived mesh (.cmesh) or error geometry (.json): read from derived_meshes, verified on every read.
            if match.group(2) == "cmesh":
                derived, media_type = backend.meshes.content(digest), MESH_MEDIA_TYPE
            else:
                derived, media_type = backend.meshes.errors_content(digest), ERRORS_MEDIA_TYPE
            if derived is None or imaging.sha256_bytes(derived) != digest:
                return error(contract, "ARTIFACT_NOT_FOUND", {"artifact": name})
            return Response(derived, media_type=media_type, headers={
                "ETag": f'"sha256:{digest}"', "Cache-Control": "private, max-age=31536000, immutable",
            })
        payload: Optional[bytes] = None
        for index in (cases.blobs, experiments.render_blobs):
            path = index.get(digest)
            if path is not None and path.is_file():
                payload = path.read_bytes()
                break
        if payload is None:
            payload = storage.blob(digest)
        if payload is None or imaging.sha256_bytes(payload) != digest:
            return error(contract, "ARTIFACT_NOT_FOUND", {"artifact": name})
        return Response(payload, media_type=contract.media_type, headers={
            "ETag": f'"sha256:{digest}"', "Cache-Control": "private, max-age=31536000, immutable",
        })
