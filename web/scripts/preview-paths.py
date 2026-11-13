"""Rewrite root-absolute asset paths in a preview build (dist-preview) to relative ones,
so the static preview works when hosted under a sub-path. Usage: python3 scripts/preview-paths.py dist-preview"""
import glob, os, re, sys

out = sys.argv[1]
for f in glob.glob(f'{out}/assets/*.js') + glob.glob(f'{out}/*.html') + glob.glob(f'{out}/assets/*.css'):
    s = open(f).read()
    pre = '../' if f.endswith('.css') else './'
    t = re.sub(r'(?<=[\s"\'`(,=])/(media|brand|favicon-|apple-touch|icon-|manifest\.webmanifest)', lambda m: pre + m.group(1), s)
    if t != s:
        open(f, 'w').write(t)
if os.path.exists(f'{out}/sw.js'):
    os.remove(f'{out}/sw.js')
