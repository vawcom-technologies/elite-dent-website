"""Report how the flying crowns are exposed in a rendered frame.

Separates tooth pixels from the brand-blue field, then prints the luminance spread
and how much of the enamel is clipped. Used to tune the light rig: a healthy frame
keeps the highlight near the top of the range with almost nothing pinned at 1.0.

    <blender python> blender/inspect_frames.py <frame.png> [...]
"""

import struct
import sys
import zlib

import numpy as np


def read_png(path):
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a png: {path}")

    pos = 8
    width = height = depth = color = None
    idat = bytearray()
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color = struct.unpack(">IIBB", body[:10])
        elif kind == b"IDAT":
            idat += body
        elif kind == b"IEND":
            break
        pos += 12 + length

    channels = {0: 1, 2: 3, 4: 2, 6: 4}[color]
    step = depth // 8
    stride = width * channels * step
    raw = zlib.decompress(bytes(idat))

    out = np.zeros((height, stride), dtype=np.uint8)
    prev = np.zeros(stride, dtype=np.uint8)
    bpp = max(channels * step, 1)
    pos = 0
    for y in range(height):
        filt = raw[pos]
        pos += 1
        line = np.frombuffer(raw[pos:pos + stride], dtype=np.uint8).copy()
        pos += stride
        if filt == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 0xFF
        elif filt == 2:
            line = (line + prev) & 0xFF
        elif filt == 3:
            for x in range(stride):
                left = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((int(left) + int(prev[x])) >> 1)) & 0xFF
        elif filt == 4:
            for x in range(stride):
                a = int(line[x - bpp]) if x >= bpp else 0
                b = int(prev[x])
                c = int(prev[x - bpp]) if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pred) & 0xFF
        out[y] = line
        prev = line

    img = out.reshape(height, width, channels * step)
    if step == 2:
        img = img[:, :, ::2]
    return img[:, :, :3].astype(np.float32) / 255.0


def report(path):
    rgb = read_png(path)
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

    # Enamel is the near-neutral bright material; the field is saturated blue.
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(mx > 1e-5, (mx - mn) / np.maximum(mx, 1e-5), 0.0)
    tooth = (lum > 0.55) & (sat < 0.22)

    n = int(tooth.sum())
    print(f"\n{path}")
    if n < 200:
        print("  no enamel found in frame")
        return
    vals = lum[tooth]
    clipped = float((vals > 0.99).mean())
    print(f"  enamel pixels : {n} ({100.0 * n / lum.size:.2f}% of frame)")
    print(f"  luminance     : min {vals.min():.3f}  p50 {np.percentile(vals, 50):.3f}  "
          f"p95 {np.percentile(vals, 95):.3f}  max {vals.max():.3f}")
    print(f"  spread p5-p95 : {np.percentile(vals, 95) - np.percentile(vals, 5):.3f}")
    print(f"  clipped >0.99 : {100.0 * clipped:.1f}%")

    corner = rgb[8, 8]
    print(f"  bg corner rgb : {corner[0]:.4f} {corner[1]:.4f} {corner[2]:.4f} "
          f"(sRGB8 {round(corner[0] * 255)},{round(corner[1] * 255)},{round(corner[2] * 255)})")


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        report(arg)
