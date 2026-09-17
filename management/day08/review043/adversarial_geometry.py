# -*- coding: utf-8 -*-
"""
Adversarial pass over PR #43's canonical geometry contract checker.

Every attack starts from the fixture the author shipped and changes exactly one
thing. An attack lands when the checker accepts something it should refuse.

Nothing here writes to tests/fixtures/geometry/** - that tree is Vu Hung Anh's
under DR-013. Everything happens on an in-memory copy.
"""
import copy, json, io, subprocess, sys, os, tempfile

# NOTE: temp fixtures must sit on the SAME DRIVE as the working directory.
# The checker at this head calls os.path.relpath(fixture, os.getcwd()) unguarded,
# which raises ValueError on Windows across drives - see finding 1 in the review.

SP = os.environ.get("QA43_DIR", ".")   # put conf43.py and fixture43.json here
CONF = os.path.join(SP, "conf43.py")
FIX = os.path.join(SP, "fixture43.json")
VER = "dr008a-dr012/v1.0.0"

base = json.load(io.open(FIX, encoding="utf-8"))


def run(fixture, expect_version=VER):
    fd, path = tempfile.mkstemp(suffix=".json", dir=os.environ.get("QA43_TMPDIR") or os.path.dirname(os.path.abspath(CONF)))
    os.close(fd)
    io.open(path, "w", encoding="utf-8").write(json.dumps(fixture))
    cmd = [sys.executable, CONF, "--fixture", path, "--implementation-name", "adversarial"]
    if expect_version is not None:
        cmd += ["--expect-contract-version", expect_version]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    os.unlink(path)
    return r.returncode, (r.stdout + r.stderr)


CASES = []


def case(name, mut, expect_version=VER, note=""):
    CASES.append((name, mut, expect_version, note))


# --- controls: the shipped fixture must pass -------------------------------
case("CONTROL: fixture as shipped, with --expect", lambda f: None, VER)
case("CONTROL: fixture as shipped, no --expect", lambda f: None, None)

# --- version binding -------------------------------------------------------
case("geometry_contract_version removed", lambda f: f.pop("geometry_contract_version"), VER)
case("geometry_contract_version = '' ", lambda f: f.__setitem__("geometry_contract_version", ""), VER)
case("geometry_contract_version = wrong string", lambda f: f.__setitem__("geometry_contract_version", "dr008a-dr012/v9.9.9"), VER)
case("WRONG version but consumer passes no --expect", lambda f: f.__setitem__("geometry_contract_version", "dr008a-dr012/v9.9.9"), None,
     "documents that the binding is opt-in")
case("geometry_contract_version = 123 (not a string)", lambda f: f.__setitem__("geometry_contract_version", 123), VER)

# --- contract identity -----------------------------------------------------
case("contract = 'DR-999'", lambda f: f.__setitem__("contract", "DR-999"), VER)

# --- envelope integrity ----------------------------------------------------
case("point_count inflated by 1", lambda f: f.__setitem__("point_count", len(f["points"]) + 1), VER)
case("points emptied", lambda f: f.__setitem__("points", []), VER)
case("picking_rays emptied", lambda f: f.__setitem__("picking_rays", []), VER)
case("a ray's group renamed to 'whatever'", lambda f: f["picking_rays"][0].__setitem__("group", "whatever"), VER)
case("expected_slice_index pushed out of range", lambda f: f["picking_rays"][0].__setitem__("expected_slice_index", 10 ** 6), VER)
case("expected_slice_index = -1", lambda f: f["picking_rays"][0].__setitem__("expected_slice_index", -1), VER)

# --- the substantive one: silently move a coordinate ----------------------
def shift_point(f):
    p = f["points"][0]
    for k in ("voxel_xyz", "world_mm", "voxel", "world"):
        if k in p and isinstance(p[k], list):
            p[k] = [p[k][0] + 7] + list(p[k][1:]); return
    raise RuntimeError("no coordinate key found in points[0]: %s" % sorted(p))
case("a point's coordinate shifted by 7", shift_point, VER,
     "the check that matters: does it verify VALUES or only shape?")


def shift_ray(f):
    r = f["picking_rays"][0]
    r["expected_slice_index"] = (r["expected_slice_index"] + 1) % max(2, f["shape_xyz"][2])
case("a ray's expected_slice_index off by one", shift_ray, VER,
     "in range but wrong - only a real computation catches this")

print("%-52s %-6s %-9s %s" % ("attack", "rc", "verdict", "note"))
print("-" * 110)
landed = 0
for name, mut, ev, note in CASES:
    f = copy.deepcopy(base)
    try:
        mut(f)
    except Exception as e:
        print("%-52s %-6s %-9s %s" % (name[:52], "-", "SETUP", repr(e)[:40])); continue
    rc, out = run(f, ev)
    is_control = name.startswith("CONTROL")
    if is_control:
        verdict = "ok" if rc == 0 else "CONTROL FAILS"
        if rc != 0:
            landed += 1
    else:
        verdict = "refused" if rc != 0 else "ACCEPTED"
        if rc == 0 and not note.startswith("documents"):
            landed += 1
    flag = "  <-- LANDS" if (verdict == "ACCEPTED" and not note.startswith("documents")) or verdict == "CONTROL FAILS" else ""
    print("%-52s %-6s %-9s %s%s" % (name[:52], rc, verdict, note[:34], flag))
print("-" * 110)
print("attacks that landed:", landed)
