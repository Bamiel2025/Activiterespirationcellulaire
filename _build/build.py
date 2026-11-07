"""Assemble l'application finale en UN SEUL fichier HTML autonome.

- bundle.js (three.js + addons), correction.js et app.js sont injectes en ligne ;
- les deux images des documents sont injectees en data URI ;
- la configuration Google Sheets (config.txt) et le Code.gs sont embarques ;
- l'original est conserve une seule fois dans une copie de sauvegarde.
"""
from pathlib import Path
from html import escape
import base64
import re
import shutil

ICI = Path(__file__).parent
DOSSIER = ICI.parent
SORTIE = DOSSIER / "respiration cellulaire.html"
SAUVEGARDE = DOSSIER / "respiration cellulaire.original.html"
JETON_DEFAUT = "respiration-2027"

html = (ICI / "app_template.html").read_text(encoding="utf-8")
bundle = (ICI / "bundle.js").read_text(encoding="utf-8")
correction = (ICI / "correction.js").read_text(encoding="utf-8")
app = (ICI / "app.js").read_text(encoding="utf-8")
code_gs = (ICI / "Code.gs").read_text(encoding="utf-8")


def lire_config():
    """Lit config.txt au format cle=valeur. Une URL vide est legitime."""
    cfg = {"url": "", "jeton": JETON_DEFAUT}
    fichier = ICI / "config.txt"
    if not fichier.exists():
        return cfg
    for ligne in fichier.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if not ligne or ligne.startswith("#") or "=" not in ligne:
            continue
        cle, valeur = ligne.split("=", 1)
        cle = cle.strip().lower()
        if cle in cfg:
            cfg[cle] = valeur.strip()
    return cfg


def securiser_script(js):
    """Empêche une fermeture de balise script provenant du code JS."""
    return js.replace("</script", "<\\/script").replace("<!--", "<\\!--")


def data_uri(fichier, mime):
    donnees = (ICI / fichier).read_bytes()
    return "data:" + mime + ";base64," + base64.b64encode(donnees).decode("ascii")


cfg = lire_config()

# correction.js est un module pur : il doit s'exécuter AVANT app.js.
app_complet = correction + "\n" + app

html = html.replace("__BUNDLE_JS__", securiser_script(bundle))
html = html.replace("__APP_JS__", securiser_script(app_complet))
html = html.replace("__IMG_DOC1__", data_uri("doc1.jpg", "image/jpeg"))
html = html.replace("__IMG_DOC3__", data_uri("doc3.png", "image/png"))
html = html.replace("__URL_SHEET__", escape(cfg["url"], quote=True))
html = html.replace("__JETON_SHEET__", escape(cfg["jeton"], quote=True))
# Contenu d'un <textarea> : on échappe <, >, & ; le navigateur le décode à la lecture.
html = html.replace("__CODE_GS__", escape(code_gs, quote=False))

# Le script est aussi fourni à côté du HTML, prêt à coller dans Apps Script.
# newline="\n" : sinon Windows écrit des CRLF et les deux copies divergent.
(DOSSIER / "Code.gs").write_text(code_gs, encoding="utf-8", newline="\n")

# NE PAS chercher les placeholders avec une regex __[A-Z0-9_]+__ :
# three.js contient déjà __PURE__, __THREE_DEVTOOLS__, __THREE__.
placeholders = [
    "__BUNDLE_JS__", "__APP_JS__", "__IMG_DOC1__", "__IMG_DOC3__",
    "__URL_SHEET__", "__JETON_SHEET__", "__CODE_GS__"
]
reste = [p for p in placeholders if p in html]
if reste:
    raise SystemExit("Placeholders non remplacés : " + ", ".join(reste))

# Aucune ressource externe ne doit subsister (hors liens de sources cités en texte).
# La meta sheet-url est volontairement exclue : c'est une configuration, pas une ressource.
externes = re.findall(r"""(?:src|href)\s*=\s*["'](https?://[^"']+)""", html)
if externes:
    raise SystemExit("Ressources externes restantes : " + repr(externes))

if SORTIE.exists() and not SAUVEGARDE.exists():
    shutil.copy2(SORTIE, SAUVEGARDE)
    print("Sauvegarde créée :", SAUVEGARDE.name)

SORTIE.write_text(html, encoding="utf-8", newline="\n")
print("Écrit :", SORTIE.name, f"({len(html.encode('utf-8')):,} octets)")
print("Nombre de balises <script> :", html.count("<script"))
print("Images embarquées :", html.count("data:image/"))
print("URL Sheets intégrée :", "oui" if cfg["url"] else "non (à configurer dans l'app ou config.txt)")
print("Jeton :", cfg["jeton"])
print("Code.gs fourni :", (DOSSIER / "Code.gs").name)
