"""The ml/ tests are CPU-only by design: hide every GPU before torch is imported, so a test
run can never open a CUDA context on a GPU a training job is using. Nothing is downloaded.
"""

import os

os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ.setdefault("HF_HUB_OFFLINE", "1")
