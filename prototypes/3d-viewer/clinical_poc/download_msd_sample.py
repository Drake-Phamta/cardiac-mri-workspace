#!/usr/bin/env python3
"""Download one CC-BY-SA MSD Heart MRI/label pair, outside the repository.

The public archive URL is also used by MONAI's DecathlonDataset. HTTP ranges
let us read tar headers and just the selected pair instead of extracting the
whole dataset. No registration-protected CAP/MM-WHS data is requested.
"""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
import shutil
import tarfile
from urllib.request import Request, urlopen

URL = "https://msd-for-monai.s3-us-west-2.amazonaws.com/Task02_Heart.tar"
REPO = Path(__file__).resolve().parents[3]


class RangeArchive(io.RawIOBase):
    def __init__(self, url):
        self.url = url
        self.position = 0
        self.cache_start = 0
        with urlopen(Request(url, headers={"Range": "bytes=0-65535"}), timeout=45) as response:
            if response.status != 206:
                raise ValueError("Archive server must support HTTP byte ranges")
            self.length = int(response.headers["Content-Range"].split("/")[-1])
            self.cache = response.read()
        if self.cache[:2] == b"\x1f\x8b":
            raise ValueError("Expected uncompressed tar containing compressed NIfTI members")

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=io.SEEK_SET):
        if whence == io.SEEK_CUR:
            offset += self.position
        elif whence == io.SEEK_END:
            offset += self.length
        if offset < 0:
            raise ValueError("Negative archive position")
        self.position = offset
        return offset

    def read(self, size=-1):
        size = min(self.length - self.position, size if size >= 0 else self.length - self.position)
        if size <= 0:
            return b""
        start = self.position
        if not (self.cache_start <= start and start + size <= self.cache_start + len(self.cache)):
            stop = min(self.length - 1, start + max(size, 65536) - 1)
            with urlopen(Request(self.url, headers={"Range": f"bytes={start}-{stop}"}), timeout=45) as response:
                if response.status != 206 or not response.headers.get("Content-Range", "").startswith(f"bytes {start}-"):
                    raise ValueError("Archive server returned an unexpected range")
                self.cache = response.read()
            if len(self.cache) != stop - start + 1:
                raise ValueError("Incomplete archive range")
            self.cache_start = start
        at = start - self.cache_start
        data = self.cache[at:at + size]
        self.position += len(data)
        return data


def download_sample(out: Path, case: str | None = None):
    out = out.resolve()
    if out == REPO or REPO in out.parents:
        raise ValueError("Source MRI/labels must stay outside the repository")
    out.mkdir(parents=True, exist_ok=True)
    archive = tarfile.open(fileobj=RangeArchive(URL), mode="r:")
    metadata = None
    wanted = {}
    found = set()
    for member in archive:
        name = member.name.removeprefix("./")
        if name == "Task02_Heart/dataset.json":
            metadata = json.load(archive.extractfile(member))
            license_name = metadata.get("licence", metadata.get("license", ""))
            if "CC-BY-SA" not in license_name.upper() or "4.0" not in license_name:
                raise ValueError(f"Unexpected dataset license: {license_name!r}")
            training = sorted(metadata["training"], key=lambda entry: entry["image"])
            chosen = next((entry for entry in training if case is None or Path(entry["image"]).name == case), None)
            if chosen is None:
                raise ValueError("Selected case is not an annotated training case")
            case = Path(chosen["image"]).name
            wanted = {
                "Task02_Heart/" + chosen["image"].removeprefix("./"): "image.nii.gz",
                "Task02_Heart/" + chosen["label"].removeprefix("./"): "label.nii.gz",
            }
            print(f"MSD Heart · {case} · {license_name}", flush=True)
        elif name in wanted:
            target = out / wanted[name]
            temporary = target.with_suffix(target.suffix + ".part")
            print(f"Fetching {wanted[name]} ({member.size / 1024**2:.1f} MiB)", flush=True)
            try:
                with archive.extractfile(member) as source, temporary.open("wb") as destination:
                    shutil.copyfileobj(source, destination, length=1024 * 1024)
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
            found.add(name)
        if metadata and found == set(wanted):
            break
    archive.close()
    if not metadata or found != set(wanted):
        raise ValueError("Paired MRI and annotation were not both found")
    provenance = {
        "dataset": "Medical Segmentation Decathlon · Task02 Heart",
        "case": case, "modality": "MRI", "source_kind": "public-mri",
        "license": metadata.get("licence", metadata.get("license")),
        "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
        "publication": "https://doi.org/10.1038/s41467-022-30695-9",
        "archive_url": URL,
        "archive_url_reference": "https://github.com/Project-MONAI/MONAI/blob/dev/monai/apps/datasets.py",
        "label_source": "Public expert annotation supplied with the dataset",
        "labels": metadata["labels"],
        "scope": "Whole-heart MRI; published segmentation covers left atrium only",
        "geometry_note": "MSD Task02 headers carry identity directions at origin 0; "
                         "the anatomical direction of the stored axes is not recorded",
    }
    (out / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(f"Saved paired MRI, label and attribution to {out}", flush=True)
    return provenance


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--case", help="Annotated case filename, e.g. la_003.nii.gz")
    args = parser.parse_args()
    download_sample(args.out, args.case)
