# © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE).
"""Varredura das fotos de todos os jogadores dos 20 clubes (elenco da janela de transferências + quem tem estatísticas).

Para cada jogador diz qual foto o site mostra (a mesma ordem do js/heatmap.js):
  privada  - recorte com a camisa do clube (TheSportsDB) ou foto do Flickr guardada como privada;
  livre    - foto livre (Wikimedia Commons / Flickr com licença);
  sem foto - número da camisa.
E por que falta: não procurado ainda, procurado e não achado no TheSportsDB, achado sem foto.
Uso: python tests/fotos_varredura.py [--lista] [--falhar-se-faltar N%]
"""
import glob
import json
import os
import re
import sys

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ler_js(arq, var):
    s = open(arq, encoding="utf-8").read()
    i = s.index(f'{var}["')
    i = s.index("=", i) + 1
    return json.JSONDecoder().raw_decode(s[i:].lstrip())[0]


def main():
    lista = "--lista" in sys.argv
    tsdb = {}
    try:
        tsdb = json.load(open(os.path.join(R, "server", "cache", "fontes-elenco.json"), encoding="utf-8")).get("tsdb") or {}
    except Exception:
        pass
    tot = {"privada": 0, "livre": 0, "sem": 0}
    motivos = {}
    faltam = []
    print(f"{'clube':15} {'jog':>4} {'privada':>8} {'livre':>6} {'sem':>5}  cobertura")
    for arq in sorted(glob.glob(os.path.join(R, "js", "mercado", "*.js"))):
        cid = os.path.basename(arq)[:-3]
        if cid == "global":
            continue
        M = ler_js(arq, "window.MERCADO")
        try:
            J = ler_js(os.path.join(R, "js", "jogadores", f"{cid}.js"), "window.JOGADORES_CLUBE").get("jogadores") or {}
        except Exception:
            J = {}
        c = {"privada": 0, "livre": 0, "sem": 0}
        for x in M.get("elenco") or []:
            aid = str(x.get("id"))
            if x.get("fotoPrivada"):
                k = "privada"
            elif (J.get(aid) or {}).get("foto"):
                k = "livre"
            else:
                k = "sem"
                r = tsdb.get(aid)
                m = "não procurado no TheSportsDB" if r is None else "não cadastrado no TheSportsDB" if not r.get("d") else "cadastrado sem foto no TheSportsDB"
                motivos[m] = motivos.get(m, 0) + 1
                faltam.append((cid, aid, x.get("nome"), x.get("idade"), x.get("min") or 0, m))
            c[k] += 1
        n = sum(c.values())
        for k in tot:
            tot[k] += c[k]
        print(f"{cid:15} {n:>4} {c['privada']:>8} {c['livre']:>6} {c['sem']:>5}  {100 * (n - c['sem']) / max(n, 1):5.1f}%")
    n = sum(tot.values())
    print(f"{'TOTAL':15} {n:>4} {tot['privada']:>8} {tot['livre']:>6} {tot['sem']:>5}  {100 * (n - tot['sem']) / max(n, 1):5.1f}%")
    print("\npor que faltam:")
    for m, q in sorted(motivos.items(), key=lambda t: -t[1]):
        print(f"  {q:4}  {m}")
    jovens = sum(1 for f in faltam if (f[3] or 99) <= 21)
    sem_min = sum(1 for f in faltam if not f[4])
    print(f"  dos {len(faltam)} sem foto: {jovens} têm 21 anos ou menos; {sem_min} sem nenhum minuto na temporada")
    if lista:
        for f in faltam:
            print("  ", *f)
    json.dump([{"cid": f[0], "id": f[1], "nome": f[2]} for f in faltam], open(os.path.join(R, "tests", "mobile", "out", "fotos-faltam.json"), "w", encoding="utf-8"), ensure_ascii=False)
    lim = next((float(a.split("=")[1].rstrip("%")) for a in sys.argv if a.startswith("--falhar-se-faltar=")), None)
    if lim is not None and 100 * tot["sem"] / max(n, 1) > lim:
        print(f"\nFALHA: {100 * tot['sem'] / n:.1f}% sem foto (limite {lim}%)")
        sys.exit(1)


if __name__ == "__main__":
    main()
