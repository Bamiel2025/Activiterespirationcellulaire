"""Construit un bundle three.js autonome (aucun import, aucun CDN).

three.module.js r160 est un module ESM sans dependance : on remplace son unique
`export { ... }` final par un `return { ... }` et on l'enveloppe dans une IIFE.
Les deux addons sont enveloppes a leur tour : leurs imports nommes deviennent
des destructurations de l'objet THREE, et leurs exports des returns.

Resultat : un script classique utilisable dans un <script> ordinaire, donc
compatible avec un fichier HTML ouvert en file:// sans serveur ni internet.
"""
from pathlib import Path
import re

ICI = Path(__file__).parent

# --- three.js -------------------------------------------------------------
src = (ICI / "three.module.js").read_text(encoding="utf-8")
m = re.search(r"^export \{ ([^}]*) \};?\s*$", src, re.M)
if not m:
    raise SystemExit("Export final de three.module.js introuvable")
noms = [n.strip() for n in m.group(1).split(",") if n.strip()]
if any(" as " in n for n in noms):
    raise SystemExit("Alias dans l'export : transformation a prevoir")
src = src[: m.start()] + "return { " + ", ".join(noms) + " };" + src[m.end() :]
if "import.meta" in src or re.search(r"^\s*import\s", src, re.M):
    raise SystemExit("Import residuel dans three.module.js")
three_iife = "const THREE = (function () {\n" + src + "\n})();\n"

# --- addons ---------------------------------------------------------------
def addon(fichier, destructuration, exports):
    txt = (ICI / fichier).read_text(encoding="utf-8")
    # Supprime le bloc `import { ... } from 'three';`
    txt, nb = re.subn(
        r"^import\s*\{[^}]*\}\s*from\s*['\"]three['\"];?\s*", "", txt, count=1, flags=re.M
    )
    if nb != 1:
        raise SystemExit(f"Import 'three' introuvable dans {fichier}")
    # Supprime l'export final
    txt, nb = re.subn(r"^export \{[^}]*\};?\s*$", "", txt, count=1, flags=re.M)
    if nb != 1:
        raise SystemExit(f"Export final introuvable dans {fichier}")
    return (
        "const { " + exports + " } = (function () {\n"
        + "  const { " + destructuration + " } = THREE;\n"
        + txt
        + "\n  return { " + exports + " };\n"
        + "})();\n"
    )

orbit = addon(
    "OrbitControls.js",
    "EventDispatcher, MOUSE, Quaternion, Spherical, TOUCH, Vector2, Vector3, Plane, Ray, MathUtils",
    "OrbitControls",
)
css2d = addon(
    "CSS2DRenderer.js",
    "Matrix4, Object3D, Vector2, Vector3",
    "CSS2DObject, CSS2DRenderer",
)

entete = (
    "/* three.js r160 + OrbitControls + CSS2DRenderer — embarques pour un "
    "fonctionnement hors ligne.\n"
    "   Sources : https://cdn.jsdelivr.net/npm/three@0.160.0/ (licence MIT). */\n"
)

bundle = entete + three_iife + "\n" + orbit + "\n" + css2d
(ICI / "bundle.js").write_text(bundle, encoding="utf-8")
print(f"bundle.js : {len(bundle):,} caracteres, {len(noms)} exports THREE")
