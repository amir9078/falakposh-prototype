"""Build the Falakposh storefront prototype into dist/.

Templates are Jinja, laid out so each one maps to a Shopify section or template later.
Run with the Python that has jinja2 + Pillow:
    "%LOCALAPPDATA%/Python/pythoncore-3.14-64/python.exe" build.py
"""
import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from PIL import Image, ImageOps

ROOT = Path(__file__).parent
SRC_IMG = ROOT.parent / "_img_src" / "full"
DIST = ROOT / "dist"
ICON_CACHE = ROOT / "icons-light"

ICONS = [
    "magnifying-glass", "heart", "handbag", "list", "x", "sun", "moon", "plus", "minus",
    "arrow-right", "arrow-left", "arrow-up-right", "caret-down", "whatsapp-logo", "instagram-logo",
    "tiktok-logo", "facebook-logo", "youtube-logo", "pinterest-logo", "truck", "globe-hemisphere-east",
    "scissors", "ruler", "check", "sliders-horizontal", "squares-four", "square", "grid-nine",
    "map-pin", "calendar-blank", "storefront", "package", "arrows-out", "trash", "phone",
]


def icon_svgs():
    ICON_CACHE.mkdir(exist_ok=True)
    out = {}
    for name in ICONS:
        f = ICON_CACHE / f"{name}.svg"
        if not f.exists():
            for attempt in range(4):
                try:
                    host = ["cdn.jsdelivr.net/npm", "unpkg.com"][attempt % 2]
                    url = f"https://{host}/@phosphor-icons/core@2/assets/light/{name}-light.svg"
                    f.write_bytes(urllib.request.urlopen(url, timeout=30).read())
                    break
                except OSError:
                    if attempt == 3:
                        raise
                    time.sleep(1 + attempt)
        svg = f.read_text(encoding="utf-8")
        svg = svg.replace("<svg ", '<svg aria-hidden="true" focusable="false" class="i" ', 1)
        out[name] = svg
    return out


def fit(im, w, ratio=None, centering=(0.5, 0.35)):
    """Resize to width w. With a ratio (w/h), crop to it first, keeping the focus point."""
    im = ImageOps.exif_transpose(im).convert("RGB")
    if ratio:
        im = ImageOps.fit(im, (w, round(w / ratio)), Image.LANCZOS, centering=centering)
    elif im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    return im


def _grade_luts():
    """The house grade: a touch less saturation, a gentle S-curve, lifted blacks and a faint warm cast,
    so photos from different shoots sit together like one campaign."""
    import math
    def curve(i, mult):
        x = i / 255
        y = x - 0.022 * math.sin(2 * math.pi * x)      # soft S
        y = 0.028 + 0.955 * y                           # lift the blacks, hold the whites
        return max(0, min(255, round(y * 255 * mult)))
    return [curve(i, 1.012) for i in range(256)] + [curve(i, 1.0) for i in range(256)] + [curve(i, 0.982) for i in range(256)]


GRADE = _grade_luts()


def grade(im):
    from PIL import ImageEnhance
    return ImageEnhance.Color(im).enhance(0.9).point(GRADE)


def save(im, name, q=80):
    path = DIST / "img" / f"{name}.webp"
    im.save(path, "WEBP", quality=q, method=6)
    return im.size


FULL_BLEED = {"e-hero-falak", "e-bridal-teal"}   # shown edge to edge: the home hero, the bridal band and bridal page


def build_images(frames):
    (DIST / "img").mkdir(parents=True, exist_ok=True)
    for old in (DIST / "img").glob("*.webp"):
        old.unlink()
    for stem, spec in frames.items():
        if stem.startswith("_"):
            continue
        im = grade(ImageOps.exif_transpose(Image.open(SRC_IMG / f"{stem}.jpg")).convert("RGB"))
        fx, fy = spec["focus"]
        if stem.startswith("p-"):
            main = fit(im, 1000, 2 / 3, (fx, fy))
            save(main, stem)
            save(fit(main, 560), f"{stem}-sm")
            # The close-up for hover and the gallery, framed per photo in images.json.
            cx, cy, cw = spec["detail"]
            w, h = main.size
            pw = int(w * cw); ph = int(pw * 1.5)
            left = min(max(0, int(w * cx - pw / 2)), w - pw)
            top = min(max(0, int(h * cy - ph / 2)), h - ph)
            detail = main.crop((left, top, left + pw, top + ph)).resize((1000, 1500), Image.LANCZOS)
            save(detail, f"{stem}-detail")
            save(fit(detail, 560), f"{stem}-detail-sm")
        else:
            if stem in FULL_BLEED:
                save(fit(im, 2400), f"{stem}-xl", 78)   # sharp on wide and high-density screens
                save(fit(im, 1300), f"{stem}-lg", 80)
            big = fit(im, 1800)
            save(big, stem, 80 if stem in FULL_BLEED else 78)
            save(fit(big, 900), f"{stem}-md", 78)


def main():
    site = json.loads((ROOT / "data" / "site.json").read_text(encoding="utf-8"))
    catalogue = json.loads((ROOT / "data" / "products.json").read_text(encoding="utf-8"))
    frames = json.loads((ROOT / "data" / "images.json").read_text(encoding="utf-8"))
    products = catalogue["products"]
    by_cat = {}
    for p in products:
        by_cat.setdefault(p["category"], []).append(p)
    cats = {c["slug"]: c for c in site["categories"]}

    if DIST.exists():
        for child in DIST.iterdir():
            if child.name != "img":
                shutil.rmtree(child) if child.is_dir() else child.unlink()
    DIST.mkdir(exist_ok=True)
    img_dir = DIST / "img"
    if "--images" in sys.argv or not img_dir.exists() or not any(img_dir.iterdir()):
        build_images(frames)
    shutil.copytree(ROOT / "static", DIST / "assets", dirs_exist_ok=True)
    # The logo as plain SVG files, for design apps that import by link (Doory, Canva).
    (DIST / "brand").mkdir(exist_ok=True)
    for svg in (ROOT.parent.parent / "brand" / "logo" / "svg-flat").glob("falakposh-*.svg"):
        shutil.copy(svg, DIST / "brand" / svg.name)
    # The Instagram set exported from Doory, for the identity page.
    social_src = ROOT.parent.parent / "social" / "instagram"
    (DIST / "social").mkdir(exist_ok=True)
    for png in (social_src / "posts").glob("*.png"):
        slug = png.stem.split("-", 1)[1]
        fit(Image.open(png), 720).save(DIST / "social" / f"post-{slug}.webp", "WEBP", quality=84, method=6)
    if (social_src / "story-template.png").exists():
        fit(Image.open(social_src / "story-template.png"), 540).save(DIST / "social" / "story.webp", "WEBP", quality=84, method=6)
    for png in social_src.glob("highlight-*.png"):
        im = Image.open(png).convert("RGB")
        side = im.width
        im = im.crop((0, (im.height - side) // 2, side, (im.height + side) // 2)).resize((200, 200), Image.LANCZOS)
        im.save(DIST / "social" / f"highlight-{png.stem.split('-', 2)[2]}.webp", "WEBP", quality=88, method=6)

    env = Environment(loader=FileSystemLoader(ROOT / "templates"), autoescape=select_autoescape(["html"]))
    # A version stamp for the CSS and JS links, so a new build never meets a cached old stylesheet.
    import hashlib
    stamp = hashlib.sha1(b"".join(f.read_bytes() for f in sorted((ROOT / "static").rglob("*.*")))).hexdigest()[:8]
    env.globals.update(v=stamp, site=site, icons=icon_svgs(), cats=cats, categories=site["categories"],
                       products=products, by_cat=by_cat, year=2026,
                       years=2026 - site["founded"])
    env.filters["aed"] = lambda v: f"{v:,.0f}"
    # object-position for a photo, from its focus point
    env.filters["fp"] = lambda stem: "{:.0f}% {:.0f}%".format(*(100 * v for v in frames.get(stem, {"focus": [0.5, 0.35]})["focus"]))

    def page(template, out, **ctx):
        html = env.get_template(template).render(**ctx)
        (DIST / out).write_text(html, encoding="utf-8")

    page("index.html", "index.html", page_id="home")
    page("collection.html", "shop.html", page_id="shop", cat=None,
         items=products, title="All pieces", line="Every piece in the house, named for something in the sky.")
    for c in site["categories"]:
        page("collection.html", f"{c['slug']}.html", page_id=c["slug"], cat=c,
             items=by_cat.get(c["slug"], []), title=c["name"], line=c["line"])
    for p in products:
        related = [x for x in by_cat[p["category"]] if x["slug"] != p["slug"]][:4]
        page("product.html", f"p-{p['slug']}.html", page_id="product", p=p, cat=cats[p["category"]], related=related)
    page("bridal.html", "bridal-appointments.html", page_id="bridal-appointments")
    page("story.html", "story.html", page_id="story")
    page("identity.html", "identity.html", page_id="identity")
    for slug in ["shipping-returns", "size-guide", "faq", "visit", "credits"]:
        page(f"pages/{slug}.html", f"{slug}.html", page_id=slug)

    # Artifact copy of the home page: the publisher adds its own document skeleton,
    # so strip ours and give the page its gallery name.
    import re
    home = (DIST / "index.html").read_text(encoding="utf-8")
    home = re.sub(r"<!doctype html>\s*|<html[^>]*>\s*|</html>\s*|<head>\s*|</head>\s*|</body>\s*", "", home, flags=re.I)
    home = re.sub(r'<meta charset="utf-8">\s*|<meta name="viewport"[^>]*>\s*', "", home)
    home = re.sub(r'<body class="[^"]*">', "", home)
    home = re.sub(r"<title>.*?</title>", "<title>Falakposh Storefront</title>", home, count=1, flags=re.S)
    (DIST / "_artifact_index.html").write_text(home, encoding="utf-8")

    (DIST / ".nojekyll").write_text("", encoding="utf-8")  # GitHub Pages: serve files as they are

    # Search index for the instant search overlay.
    index = [{"slug": p["slug"], "name": p["name"], "urdu": p["urdu"], "cat": cats[p["category"]]["name"],
              "colour": p["colour"], "fabric": p["fabric"], "price": p["price"], "from": p.get("from", False)}
             for p in products]
    (DIST / "assets" / "search.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print("built", len(list(DIST.glob("*.html"))), "pages")


if __name__ == "__main__":
    main()
