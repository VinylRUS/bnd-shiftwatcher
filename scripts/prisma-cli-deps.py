#!/usr/bin/env python3
"""Вычислить транзитивное замыкание пакетов, нужных Prisma CLI,
по фактическому дереву node_modules (bun ставит плоско, но обрабатываем
и вложенные node_modules). Результат — список путей для копирования в образ."""
import json
import os
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'node_modules')
START = ['prisma']


def read_pkg(pkg_dir):
    pj = os.path.join(pkg_dir, 'package.json')
    if not os.path.isfile(pj):
        return None
    try:
        with open(pj, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def resolve(from_dir, name):
    """Резолвим name так же, как node: идём вверх по каталогам."""
    d = from_dir
    while True:
        cand = os.path.join(d, 'node_modules', name)
        if os.path.isdir(cand):
            return cand
        nxt = os.path.dirname(d)
        if nxt == d:
            return None
        d = nxt


seen = {}  # name -> resolved path
queue = []

for s in START:
    p = os.path.join(ROOT, s)
    if os.path.isdir(p):
        queue.append(p)
        seen[s] = p

while queue:
    pkg_dir = queue.pop()
    pkg = read_pkg(pkg_dir)
    if not pkg:
        continue
    deps = []
    for field in ('dependencies', 'optionalDependencies'):
        deps += list((pkg.get(field) or {}).keys())
    for field in ('peerDependencies',):
        # peer-зависимости включаем, только если они реально есть в дереве
        deps += list((pkg.get(field) or {}).keys())
    for dep in deps:
        if dep in seen:
            continue
        resolved = resolve(os.path.dirname(pkg_dir), dep)
        if resolved and resolved.startswith(ROOT + os.sep):
            seen[dep] = resolved
            queue.append(resolved)

# Группируем: обычные пакеты — по одному каталогу; @scope — целиком не берём,
# только нужные пакеты скоупа
plain = sorted(n for n in seen if not n.startswith('@'))
scoped = sorted(n for n in seen if n.startswith('@'))

print("PLAIN:" + " ".join(plain))
print("SCOPED:" + " ".join(scoped))
total = 0
for n, p in seen.items():
    for dirpath, _dirs, files in os.walk(p):
        for fn in files:
            try:
                total += os.path.getsize(os.path.join(dirpath, fn))
            except OSError:
                pass
print(f"TOTAL_SIZE_MB:{total / 1024 / 1024:.1f}")
