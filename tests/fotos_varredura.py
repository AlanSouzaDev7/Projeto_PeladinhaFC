# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""Varredura das fotos de todos os jogadores do elenco dos 20 clubes: qual foto o site mostra (js/fotos.js, gravado
pelo monitor de fotos) e por que falta.
  clube    - foto da temporada no site oficial do clube (guardada em img/jogadores/);
  outras   - TheSportsDB, ESPN, API-Football ou Flickr (também guardadas);
  sem foto - número da camisa (a foto da Wikipédia não aparece mais).
Confere também se cada cópia guardada existe de verdade no disco.
Uso: python tests/fotos_varredura.py [--lista] [--falhar-se-faltar=N%]
"""
import glob
import json
import os
import re
import sys

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEM_SITE = {"athletico-pr": "site do clube recusa acesso automático", "corinthians": "site do clube recusa acesso automático",
            "cruzeiro": "elenco no site do clube pede login"}


def ler_js(arq, var):
    s = open(arq, encoding="utf-8").read()
    i = s.index(f'{var}["') if f'{var}["' in s else s.index(var)
    i = s.index("=", i) + 1
    return json.JSONDecoder().raw_decode(s[i:].lstrip())[0]


def main():
    lista = "--lista" in sys.argv
    try:
        FOTOS = ler_js(os.path.join(R, "js", "fotos.js"), "window.FOTOS")
    except Exception:
        FOTOS = {}
    paginas = set(re.findall(r'^\s+"?([a-z-]+)"?: "https://', open(os.path.join(R, "server", "fotos_clubes.mjs"), encoding="utf-8").read(), re.M))
    tot = {"clube": 0, "outras": 0, "sem": 0}
    motivos, faltam, quebradas = {}, [], []
    print(f"{'clube':15} {'jog':>4} {'clube':>6} {'outras':>7} {'sem':>5}  cobertura")
    for arq in sorted(glob.glob(os.path.join(R, "js", "mercado", "*.js"))):
        cid = os.path.basename(arq)[:-3]
        if cid == "global":
            continue
        M = ler_js(arq, "window.MERCADO")
        F = FOTOS.get(cid) or {}
        c = {"clube": 0, "outras": 0, "sem": 0}
        for x in M.get("elenco") or []:
            aid = str(x.get("id"))
            f = F.get(aid)
            if f and f.get("f") != "Wikimedia":
                k = "clube" if f["f"] == "Clube" else "outras"
                u = f["u"].split("?")[0]
                if not u.startswith("http") and not os.path.exists(os.path.join(R, u)):
                    quebradas.append((cid, x.get("nome"), u))
            else:
                k = "sem"
                m = SEM_SITE.get(cid) or ("site do clube ainda não lido" if cid not in paginas else "não está na página do elenco do clube")
                motivos[m] = motivos.get(m, 0) + 1
                faltam.append((cid, aid, x.get("nome"), x.get("idade"), x.get("min") or 0, m))
            c[k] += 1
        n = sum(c.values())
        for k in tot:
            tot[k] += c[k]
        print(f"{cid:15} {n:>4} {c['clube']:>6} {c['outras']:>7} {c['sem']:>5}  {100 * (n - c['sem']) / max(n, 1):5.1f}%")
    n = sum(tot.values())
    print(f"{'TOTAL':15} {n:>4} {tot['clube']:>6} {tot['outras']:>7} {tot['sem']:>5}  {100 * (n - tot['sem']) / max(n, 1):5.1f}%")
    print("\npor que faltam:")
    for m, q in sorted(motivos.items(), key=lambda t: -t[1]):
        print(f"  {q:4}  {m}")
    jovens = sum(1 for f in faltam if (f[3] or 99) <= 21)
    sem_min = sum(1 for f in faltam if not f[4])
    print(f"  dos {len(faltam)} sem foto: {jovens} têm 21 anos ou menos; {sem_min} sem nenhum minuto na temporada")
    print(f"\ncópias guardadas que não existem no disco: {len(quebradas)}")
    for q in quebradas[:10]:
        print("  ", *q)
    if lista:
        for f in faltam:
            print("  ", *f)
    os.makedirs(os.path.join(R, "tests", "mobile", "out"), exist_ok=True)
    json.dump([{"cid": f[0], "id": f[1], "nome": f[2]} for f in faltam], open(os.path.join(R, "tests", "mobile", "out", "fotos-faltam.json"), "w", encoding="utf-8"), ensure_ascii=False)
    lim = next((float(a.split("=")[1].rstrip("%")) for a in sys.argv if a.startswith("--falhar-se-faltar=")), None)
    if quebradas or (lim is not None and 100 * tot["sem"] / max(n, 1) > lim):
        print(f"\nFALHA: {len(quebradas)} cópias faltando no disco; {100 * tot['sem'] / max(n, 1):.1f}% sem foto" + (f" (limite {lim}%)" if lim is not None else ""))
        sys.exit(1)


if __name__ == "__main__":
    main()
