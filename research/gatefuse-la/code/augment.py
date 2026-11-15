"""Training-time augmentation by name, for train_ml.py --aug.

Every entry takes one training batch (the dict of CPU tensors that
train_ml.Batches yields: "x" image, "y" mask, and/or encoder features) and a
torch.Generator on the training device, and returns the batch to train on.

  none  no augmentation (the IP setting)
"""


def no_augment(batch, gen):
    return batch


AUGMENTS = {"none": no_augment}
