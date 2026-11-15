"""The route table, the middleware order and the request-log route values, pinned.

The API is served by several router modules; this snapshot proves that the split keeps every route at the same
method, path, name, position and parameters, so FastAPI matches requests (and logs them) exactly as before.
"""

from __future__ import annotations

import json

from fastapi.routing import APIRoute

ROUTES = [
    ("GET", "/health", "health"),
    ("GET", "/api/v1/artifacts/{name}", "artifact"),
    ("GET", "/api/v1/studies/{study_id}", "study_get"),
    ("GET", "/api/v1/studies/{study_id}/cases", "case_list"),
    ("GET", "/api/v1/cases/{case_id}", "case_get"),
    ("GET", "/api/v1/cases/{case_id}/slices/{slice_index}/mri", "mri_slice_get"),
    ("GET", "/api/v1/cases/{case_id}/slices/{slice_index}/ground-truth", "ground_truth_slice_get"),
    ("GET", "/api/v1/cases/{case_id}/geometry", "geometry_get"),
    ("GET", "/api/v1/experiments", "experiment_list"),
    ("GET", "/api/v1/experiments/compare", "experiment_compare"),
    ("GET", "/api/v1/experiments/{experiment_id}", "experiment_get"),
    ("GET", "/api/v1/experiments/{experiment_id}/metrics", "experiment_metrics"),
    ("GET", "/api/v1/experiments/{experiment_id}/cases", "experiment_cases"),
    ("POST", "/api/v1/cases/{case_id}/analysis-runs", "analysis_run_create"),
    ("GET", "/api/v1/analysis-runs/{run_id}", "analysis_run_get"),
    ("GET", "/api/v1/analysis-runs/{run_id}/metrics", "analysis_run_metrics"),
    ("GET", "/api/v1/analysis-runs/{run_id}/slices/{slice_index}/metrics", "analysis_slice_metrics"),
    ("GET", "/api/v1/analysis-runs/{run_id}/slices/{slice_index}/error", "analysis_slice_error"),
    ("GET", "/api/v1/analysis-runs/{run_id}/slices/{slice_index}/prediction", "prediction_slice_get"),
    ("GET", "/api/v1/analysis-runs/{run_id}/reconstruction", "reconstruction_get"),
    ("GET", "/api/v1/analysis-runs/{run_id}/error-reconstruction", "error_reconstruction_get"),
    ("POST", "/api/v1/analysis-runs/{run_id}/reviews", "review_create"),
    ("PATCH", "/api/v1/reviews/{review_id}", "review_patch"),
    ("PUT", "/api/v1/reviews/{review_id}/working-mask/slices/{slice_index}", "working_mask_put"),
    ("POST", "/api/v1/reviews/{review_id}/commit", "review_commit"),
    ("GET", "/api/v1/reviews/{review_id}/reviewed-masks", "reviewed_masks_list"),
    ("GET", "/api/v1/reviewed-masks/{reviewed_mask_id}/slices/{slice_index}", "reviewed_mask_slice_get"),
    ("GET", "/api/v1/reviews/{review_id}/history", "review_history_list"),
    ("POST", "/api/v1/findings", "finding_create"),
    ("GET", "/api/v1/findings", "findings_list"),
    ("PATCH", "/api/v1/findings/{finding_id}", "finding_patch"),
]

# Query and body parameters of each route, by name: the request a route accepts must not change either.
QUERY = {
    "case_list": ["mode", "q", "limit", "page"],
    "experiment_list": ["prediction_variant"],
    "experiment_compare": ["ids"],
    "analysis_run_metrics": ["prediction_variant"],
    "analysis_slice_metrics": ["prediction_variant"],
    "analysis_slice_error": ["prediction_variant"],
    "prediction_slice_get": ["variant"],
    "reconstruction_get": ["source_mask_id"],
    "error_reconstruction_get": ["prediction_variant"],
    "findings_list": ["case_id", "analysis_run_id", "experiment_id", "status", "finding_type"],
}
BODY = {"analysis_run_create", "review_create", "review_patch", "working_mask_put", "review_commit",
        "finding_create", "finding_patch"}


def _api_routes(app):
    return [route for route in app.router.routes if isinstance(route, APIRoute)]


def test_the_route_table_keeps_every_method_path_name_and_position(api):
    routes = _api_routes(api.app)
    assert [(sorted(route.methods)[0], route.path, route.name) for route in routes] == ROUTES
    assert all(len(route.methods) == 1 for route in routes)
    for route in routes:
        assert [param.name for param in route.dependant.query_params] == QUERY.get(route.name, []), route.name
        assert [param.name for param in route.dependant.body_params] == (["payload"] if route.name in BODY else [])


def test_the_middleware_and_error_handlers_stay_in_place(api):
    # add_middleware puts the newest first: the request log wraps the body limit, which wraps the routes.
    assert [entry.cls.__name__ for entry in api.app.user_middleware] == ["RequestLogMiddleware", "BodyLimitMiddleware"]
    from fastapi.exceptions import RequestValidationError
    from starlette.exceptions import HTTPException

    assert api.app.exception_handlers[RequestValidationError].__name__ == "_malformed_body"
    assert api.app.exception_handlers[HTTPException].__name__ == "_no_route"


def test_every_request_is_logged_under_its_route_template(api):
    sample = {"name": "0" * 64 + ".png", "study_id": "STUDY_LA_001", "case_id": "CASE_9001", "slice_index": "3",
              "experiment_id": "EXP-U-025", "run_id": "RUN_9001", "review_id": "R_NONE",
              "reviewed_mask_id": "RM_NONE", "finding_id": "F_NONE"}
    for method, path, name in ROUTES:
        url = path.format(**sample)
        kwargs = {"json": {}} if name in BODY else {}
        api.client.request(method, url, **kwargs)
        lines = api.app.state.backend.settings.request_log.read_text(encoding="utf-8").splitlines()
        last = json.loads(lines[-1])
        assert (last["method"], last["route"]) == (method, path), (name, last)
    api.client.get("/api/v1/no-such-route")
    last = json.loads(api.app.state.backend.settings.request_log.read_text(encoding="utf-8").splitlines()[-1])
    assert last["route"] is None and last["status"] == 404
