"""Segmentation heads.

FusionDecoder - the proposed GateFuse head and its controlled variants.
    mode="dinov3"  : DINOv3 features only                         (config A)
    mode="mricore" : MRI-CORE features only                        (config B)
    mode="concat"  : concatenate both, 1x1 conv mixing             (config C)
    mode="gate"    : per-pixel learned gate g in [0, 1]            (config D)
                     F = g * P_dinov3 + (1 - g) * P_mricore
    mode="gatedge" : D plus a full-resolution detail branch fed with the
                     image and its Sobel gradient magnitude      (config D+)
Every variant shares the same projection width and the same upsampling
decoder, so differences come from the features and the fusion only.

UNet2D - a plain U-Net trained from scratch on the image (no pre-training).
"""
import torch
import torch.nn as nn
import torch.nn.functional as F


def conv_bn_relu(cin, cout, k=3):
    return nn.Sequential(nn.Conv2d(cin, cout, k, padding=k // 2, bias=False),
                         nn.BatchNorm2d(cout), nn.ReLU(inplace=True))


class UpBlock(nn.Module):
    def __init__(self, cin, cout):
        super().__init__()
        self.conv = conv_bn_relu(cin, cout)

    def forward(self, x):
        x = F.interpolate(x, scale_factor=2, mode="bilinear", align_corners=False)
        return self.conv(x)


class SobelDetail(nn.Module):
    """Full-resolution detail branch (chapter 5): the image and its Sobel
    gradient magnitude go through two 3x3 conv layers at 256 x 256, giving the
    decoder the fine boundary information that 16 x 16 ViT patches lose."""

    def __init__(self, ch: int = 16):
        super().__init__()
        kx = torch.tensor([[-1.0, 0.0, 1.0], [-2.0, 0.0, 2.0], [-1.0, 0.0, 1.0]]) / 8.0
        self.register_buffer("kx", kx.view(1, 1, 3, 3))
        self.register_buffer("ky", kx.t().contiguous().view(1, 1, 3, 3))
        self.net = nn.Sequential(conv_bn_relu(2, ch), conv_bn_relu(ch, ch))

    def forward(self, img):                              # img: (B, 1, H, W) in [0, 1]
        gx = F.conv2d(img, self.kx, padding=1)
        gy = F.conv2d(img, self.ky, padding=1)
        mag = torch.sqrt(gx ** 2 + gy ** 2 + 1e-12)
        mag = mag / (mag.amax(dim=(2, 3), keepdim=True) + 1e-6)
        return self.net(torch.cat([img, mag], 1))


class FusionDecoder(nn.Module):
    MODES = ("dinov3", "mricore", "concat", "gate", "gatedge")

    def __init__(self, mode: str, in_dim: int = 768, width: int = 128, out_size: int = 256):
        super().__init__()
        if mode not in self.MODES:
            raise ValueError(mode)
        self.mode = mode
        self.out_size = out_size
        uses_g = mode in ("dinov3", "concat", "gate", "gatedge")
        uses_m = mode in ("mricore", "concat", "gate", "gatedge")
        self.proj_g = conv_bn_relu(in_dim, width, k=1) if uses_g else None
        self.proj_m = conv_bn_relu(in_dim, width, k=1) if uses_m else None
        if mode == "concat":
            self.mix = conv_bn_relu(2 * width, width, k=1)
        if mode in ("gate", "gatedge"):
            self.gate = nn.Conv2d(2 * width, 1, kernel_size=3, padding=1)
            nn.init.zeros_(self.gate.weight)   # start from g = 0.5 everywhere
            nn.init.zeros_(self.gate.bias)
        w = width
        self.up = nn.Sequential(UpBlock(w, w // 2), UpBlock(w // 2, w // 4), UpBlock(w // 4, w // 8))
        extra = 0
        if mode == "gatedge":
            self.detail = SobelDetail(w // 8)
            extra = w // 8
        self.head = nn.Sequential(conv_bn_relu(w // 8 + extra, w // 16), nn.Conv2d(w // 16, 1, 1))

    def fuse(self, f_g, f_m):
        if self.mode == "dinov3":
            return self.proj_g(f_g), None
        if self.mode == "mricore":
            return self.proj_m(f_m), None
        pg, pm = self.proj_g(f_g), self.proj_m(f_m)
        if self.mode == "concat":
            return self.mix(torch.cat([pg, pm], 1)), None
        g = torch.sigmoid(self.gate(torch.cat([pg, pm], 1)))
        return g * pg + (1 - g) * pm, g

    def forward(self, f_g=None, f_m=None, img=None):
        x, g = self.fuse(f_g, f_m)
        x = self.up(x)                                   # 32 -> 64 -> 128 -> 256
        if x.shape[-1] != self.out_size:
            x = F.interpolate(x, size=(self.out_size, self.out_size), mode="bilinear",
                              align_corners=False)
        if self.mode == "gatedge":
            x = torch.cat([x, self.detail(img)], 1)
        return self.head(x), g


class UNet2D(nn.Module):
    def __init__(self, base: int = 32, depth: int = 4):
        super().__init__()
        chs = [base * 2 ** i for i in range(depth + 1)]
        self.enc = nn.ModuleList()
        cin = 1
        for c in chs:
            self.enc.append(nn.Sequential(conv_bn_relu(cin, c), conv_bn_relu(c, c)))
            cin = c
        self.upconv = nn.ModuleList()
        self.dec = nn.ModuleList()
        for c_hi, c_lo in zip(chs[::-1][:-1], chs[::-1][1:]):
            self.upconv.append(nn.ConvTranspose2d(c_hi, c_lo, 2, stride=2))
            self.dec.append(nn.Sequential(conv_bn_relu(2 * c_lo, c_lo), conv_bn_relu(c_lo, c_lo)))
        self.out = nn.Conv2d(chs[0], 1, 1)

    def forward(self, x):
        skips = []
        for i, block in enumerate(self.enc):
            x = block(x)
            if i < len(self.enc) - 1:
                skips.append(x)
                x = F.max_pool2d(x, 2)
        for up, block, skip in zip(self.upconv, self.dec, reversed(skips)):
            x = block(torch.cat([up(x), skip], 1))
        return self.out(x), None


def bce_dice_loss(logits, target, eps=1.0):
    bce = F.binary_cross_entropy_with_logits(logits, target)
    p = torch.sigmoid(logits)
    inter = (p * target).sum(dim=(1, 2, 3))
    dice = 1 - (2 * inter + eps) / (p.sum(dim=(1, 2, 3)) + target.sum(dim=(1, 2, 3)) + eps)
    return 0.5 * bce + 0.5 * dice.mean()


def n_params(module):
    return sum(p.numel() for p in module.parameters() if p.requires_grad)
