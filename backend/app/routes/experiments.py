"""Experiments: the list, the comparison of two or more, one experiment, its metrics and its per-case rows."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import FastAPI, Query

from ..contract import ApiError
from ..experiments import Package
from ..metrics import C2_VARIANT
from ..state import Backend
from .common import endpoint, ok


def experiment_variant(package: Package) -> str:
    return C2_VARIANT.get(package.experiment["prediction_variant"], package.experiment["prediction_variant"])


def add_routes(app: FastAPI, backend: Backend) -> None:
    contract, experiments, metrics = backend.contract, backend.experiments, backend.metrics
    base, enums = contract.base_path, contract.enums

    @app.get(f"{base}/experiments")
    @endpoint(contract, "experiment_list")
    def experiment_list(prediction_variant: Optional[str] = Query(None)) -> Any:
        if prediction_variant is not None and prediction_variant not in enums["prediction_variant"]:
            raise ApiError("ARTIFACT_NOT_FOUND", {"prediction_variant": prediction_variant})
        packages = [experiments.experiments[key] for key in experiments.experiment_ids()]
        if prediction_variant is not None:
            packages = [package for package in packages if experiment_variant(package) == prediction_variant]
        populations = {package.experiment["evaluation_population_manifest"]["manifest_id"] for package in packages}
        return ok({
            "items": [{"experiment_id": package.experiment["experiment_id"],
                       "prediction_variant": experiment_variant(package)} for package in packages],
            # The population every listed experiment shares, or null when they do not share one.
            "evaluation_population": populations.pop() if len(populations) == 1 else None,
        })

    @app.get(f"{base}/experiments/compare")
    @endpoint(contract, "experiment_compare")
    def experiment_compare(ids: Optional[str] = Query(None)) -> Any:
        requested = [value for value in (ids or "").split(",") if value]
        if len(requested) < 2 or len(set(requested)) != len(requested):
            raise ApiError("VALIDATION_ERROR", {"field": "ids", "reason": "two or more distinct experiment ids"})
        packages = []
        for experiment_id in requested:
            package = experiments.experiments.get(experiment_id)
            if package is None:
                raise ApiError("ARTIFACT_NOT_FOUND", {"experiment_id": experiment_id})
            packages.append(package)
        return ok(metrics.compare(packages))

    @app.get(f"{base}/experiments/{{experiment_id}}")
    @endpoint(contract, "experiment_get")
    def experiment_get(experiment_id: str) -> Any:
        package = experiments.experiments.get(experiment_id)
        if package is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"experiment_id": experiment_id})
        experiment = package.experiment
        return ok({
            "experiment_id": experiment["experiment_id"],
            "model_family": experiment["model_family"],
            "training_fraction": experiment["training_fraction"],
            "split_manifest_id": experiment["split_manifest"]["manifest_id"],
            "subset_manifest_id": experiment["training_subset_manifest"]["manifest_id"],
            "preprocessing_version": experiment["preprocessing_version"],
            "postprocessing_version": experiment["postprocessing_version"],
            "checkpoint": {"checkpoint_id": experiment["checkpoint"]["checkpoint_id"],
                           "checksum": "sha256:" + experiment["checkpoint"]["checksum"]["value"]},
            "evaluation_version": experiment["evaluation_code_version"],
            "prediction_variant": experiment_variant(package),
        })

    @app.get(f"{base}/experiments/{{experiment_id}}/metrics")
    @endpoint(contract, "experiment_metrics")
    def experiment_metrics(experiment_id: str) -> Any:
        package = experiments.experiments.get(experiment_id)
        if package is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"experiment_id": experiment_id})
        return ok(metrics.experiment_metrics(package))

    @app.get(f"{base}/experiments/{{experiment_id}}/cases")
    @endpoint(contract, "experiment_cases")
    def experiment_cases(experiment_id: str) -> Any:
        package = experiments.experiments.get(experiment_id)
        if package is None:
            raise ApiError("ARTIFACT_NOT_FOUND", {"experiment_id": experiment_id})
        return ok(metrics.experiment_cases(package))
