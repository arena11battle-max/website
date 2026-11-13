import sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
src, logo, out = sys.argv[1:4]
im = Image.open(src).convert('RGB')
W, H = im.size
a = np.asarray(im).astype(np.float32)

# 1) labels and leader lines -> inpaint from surroundings
rects = [(70, 45, 295, 145), (20, 238, 272, 340), (1045, 118, 1250, 222), (915, 675, 1150, 778)]
lines = [((290, 70), (440, 108)), ((268, 262), (352, 326)), ((1052, 160), (936, 203)), ((1082, 425), (1016, 473)), ((924, 705), (756, 733))]
mrect = Image.new('L', (W, H), 0); d = ImageDraw.Draw(mrect)
for r in rects: d.rectangle(r, fill=255)
corr = Image.new('L', (W, H), 0); d2 = ImageDraw.Draw(corr)
for p, q in lines:
    d2.line([p, q], fill=255, width=26)
    for c in (p, q): d2.ellipse([c[0] - 9, c[1] - 9, c[0] + 9, c[1] + 9], fill=255)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
orange = (R > 110) & (R - B > 50) & (R - G > 25)
ml = (np.asarray(corr) > 0) & orange
ml = np.asarray(Image.fromarray((ml * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
mask = (np.asarray(mrect) > 0) | ml

def inpaint(arr, m, radius):
    valid = (~m).astype(np.float32)
    outp = arr.copy()
    for _ in range(3):
        num = np.stack([np.asarray(Image.fromarray(np.clip(outp[..., c] * valid, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) for c in range(3)], -1)
        den = np.asarray(Image.fromarray((valid * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))).astype(np.float32)[..., None] / 255
        fill = num / np.maximum(den, 1e-3)
        outp = np.where(m[..., None], fill, outp)
    return outp
a = inpaint(a, ml, 4)
a = inpaint(a, np.asarray(mrect) > 0, 30)
# add a little noise so filled areas match the photo grain
noise = np.random.default_rng(1).normal(0, 2.0, a.shape)
a = np.where(mask[..., None], a + noise, a)
base = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

# 2) ARENA11 patch in place of the wrong one
P = Image.new('RGBA', (600, 450), (0, 0, 0, 0)); dp = ImageDraw.Draw(P)
dp.rounded_rectangle([4, 4, 596, 446], radius=34, fill=(22, 21, 20, 255))
dp.rounded_rectangle([22, 22, 578, 428], radius=24, outline=(236, 120, 40, 255), width=14)
lg = Image.open(logo).convert('RGBA'); lw = 500; lg = lg.resize((lw, round(lg.height * lw / lg.width)), Image.LANCZOS)
P.alpha_composite(lg, ((600 - lw) // 2, (450 - lg.height) // 2))
# light from the upper left like the photo
shade = np.linspace(1.08, 0.85, 600)[None, :] * np.linspace(1.0, 0.88, 450)[:, None]
pa = np.asarray(P).astype(np.float32); pa[..., :3] *= shade[..., None]
P = Image.fromarray(pa.astype(np.uint8))
dst = [(799, 192), (936, 164), (984, 295), (847, 340)]
srcq = [(0, 0), (600, 0), (600, 450), (0, 450)]
def coeffs(pa, pb):
    M = []
    for (x, y), (X, Y) in zip(pa, pb):
        M.append([x, y, 1, 0, 0, 0, -X * x, -X * y]); M.append([0, 0, 0, x, y, 1, -Y * x, -Y * y])
    return np.linalg.solve(np.array(M, float), np.array(pb, float).reshape(8))
c = coeffs(dst, srcq)
warped = P.transform((W, H), Image.PERSPECTIVE, tuple(c), Image.BICUBIC)
base = base.convert('RGBA'); base.alpha_composite(warped)

# 3) crop the main helmet and fade the edges to transparent
x0, y0, x1, y1 = 170, 40, 1080, 830
crop = base.crop((x0, y0, x1, y1))
w, h = crop.size
yy, xx = np.mgrid[0:h, 0:w]
cx, cy = w * 0.5, h * 0.52
r = np.sqrt(((xx - cx) / (w * 0.56)) ** 2 + ((yy - cy) / (h * 0.56)) ** 2)
alpha = np.clip((1.0 - r) / 0.22, 0, 1) ** 1.4
ca = np.asarray(crop).astype(np.float32); ca[..., 3] = alpha * 255
Image.fromarray(ca.astype(np.uint8)).save(out)
base.convert('RGB').save(out.replace('.png', '-full.jpg'), quality=92)
