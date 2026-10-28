#!/usr/bin/env python3
"""Cache-busting: give every local .js/.css link in the site a ?v=<time> tag.
Run before each push. Browsers then load the new files at once instead of an old saved copy."""
import os, re, time, glob
root = os.path.dirname(os.path.abspath(__file__))
v = time.strftime('%Y%m%d%H%M')
pat = re.compile(r'((?:src|href)="(?!https?:|//)[^"?]+\.(?:js|css))(?:\?v=\d+)?"')
for p in glob.glob(os.path.join(root, '**', '*.html'), recursive=True):
    s = open(p).read()
    n = pat.sub(lambda m: m.group(1) + '?v=' + v + '"', s)
    if n != s:
        open(p, 'w').write(n)
        print('tagged', os.path.relpath(p, root))
# The pages compare their own ?v= with this file when they open (shared/nav.js) and reload themselves if a newer one is live.
open(os.path.join(root, 'version.json'), 'w').write('{"v":"' + v + '"}\n')
print('version', v)
