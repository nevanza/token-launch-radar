#!/usr/bin/env python3
"""Validasi gate token-radar-01 terhadap direktori output, mengikuti tujuh baris RULES.txt."""
import json, os, sys, re
from pathlib import Path

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/tr-out')
problems = []

def ok(name, cond, detail=''):
    print(('PASS ' if cond else 'FAIL ') + name + (('  ' + detail) if detail else ''))
    if not cond: problems.append(name)

# 1. dashboard_files
dash = OUT / 'dashboard'
files = [p for p in dash.rglob('*') if p.is_file()] if dash.is_dir() else []
ok('dashboard_files: index.html', (dash / 'index.html').is_file())
exts = {p.suffix for p in files}
ok('dashboard_files: css+js', '.css' in exts and '.js' in exts)
ok('dashboard_files: under 400 files', len(files) <= 400, f'{len(files)} files')
total = sum(p.stat().st_size for p in files)
ok('dashboard_files: under 4 MiB', total <= 4 * 1024 * 1024, f'{total} bytes')
bad_net = []
for p in files:
    if p.suffix in ('.html', '.css', '.js', '.mjs'):
        t = p.read_text(encoding='utf-8', errors='replace')
        for m in re.finditer(r'https?://', t):
            bad_net.append(f'{p.name}: {t[max(0,m.start()-30):m.start()+20]}')
ok('dashboard_files: no network address', not bad_net, '; '.join(bad_net[:3]))

# 2. board_file
board = json.loads((OUT / 'board.json').read_text())
rows = board['rows'] if isinstance(board, dict) else board
snap = json.loads(Path('/home/ubuntu/.hermes/cache/scratch/makefun/kit/token-radar-01-kit/input/snapshot.json').read_text())
slugs = {p['slug'] for p in snap['protocols']}
ok('board_file: 100..4000 rows', 100 <= len(rows) <= 4000, f'{len(rows)}')
ok('board_file: under 8 MiB', (OUT / 'board.json').stat().st_size <= 8 * 1024 * 1024)
bad_rows = [r for r in rows if r['slug'] not in slugs]
ok('board_file: every slug is in the snapshot', not bad_rows, f'{len(bad_rows)} bad')
ok('board_file: required fields', all(
    isinstance(r['name'], str) and r['name'] and isinstance(r['rank'], int) and r['rank'] > 0
    and isinstance(r['implied_value_usd'], int) and 0 < r['implied_value_usd'] <= 100_000_000_000_000
    and isinstance(r['farm_steps'], list) for r in rows))

# 3. sorted_by_value
ranks = sorted(r['rank'] for r in rows)
ok('sorted_by_value: ranks 1..N', ranks == list(range(1, len(rows) + 1)))
by_rank = sorted(rows, key=lambda r: r['rank'])
mono = all(by_rank[i]['implied_value_usd'] <= by_rank[i - 1]['implied_value_usd'] for i in range(1, len(by_rank)))
ok('sorted_by_value: non-increasing', mono)
ok('sorted_by_value: not all equal', len({r['implied_value_usd'] for r in rows}) > 1)

# 4. coverage
missing = [s for s in snap['watchlist'] if s not in {r['slug'] for r in rows}]
ok('coverage: every watchlist slug', not missing, f'{len(missing)} missing')

# 5. farm_steps
bad_steps = []
for r in rows:
    if not (3 <= len(r['farm_steps']) <= 12):
        bad_steps.append(r['slug'])
        continue
    for s in r['farm_steps']:
        t = s.strip()
        if not (20 <= len(t) <= 600):
            bad_steps.append(f"{r['slug']}({len(t)})")
            break
ok('farm_steps: 3..12 steps, 20..600 chars', not bad_steps, ', '.join(bad_steps[:3]))

# 6. screenshots
try:
    from PIL import Image
    shots = [p for p in (OUT / 'screenshots').iterdir() if p.is_file() and not p.name.startswith('.')]
    ok('screenshots: 3..4 images', 3 <= len(shots) <= 4, f'{len(shots)}')
    for p in shots:
        im = Image.open(p)
        long_side, short_side = max(im.size), min(im.size)
        cond = (p.stat().st_size <= 512 * 1024 and long_side <= 1440 and short_side >= 800
                and im.format in ('PNG', 'JPEG'))
        ok(f'screenshots: {p.name}', cond, f'{im.size} {p.stat().st_size}B {im.format}')
except ImportError:
    print('SKIP screenshots (Pillow missing)')

# 7. dossier
dossier = OUT / 'dossier.json'
ok('dossier_matches: exists', dossier.is_file())
if dossier.is_file():
    d = json.loads(dossier.read_text())
    ok('dossier_matches: has text+images', 'text' in d and 'images' in d, f'{len(d.get("images", []))} images')
    ok('dossier_matches: under 1.5 MiB', dossier.stat().st_size <= 1.5 * 1024 * 1024, f'{dossier.stat().st_size}B')
    tb = len(d['text'].encode())
    print(f'     dossier text: {tb} bytes of 65536 ({tb/65536*100:.0f}%)')

print()
print('GATE:', 'PASS' if not problems else f'FAIL ({len(problems)}): ' + ', '.join(problems))
