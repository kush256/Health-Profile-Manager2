"""Cut the front and side character sprites into a jointed cutout puppet.

Usage:  python3 tools/rig_cut.py            (run from the anime-scene folder)

Reads   sprites/front.png, sprites/side.png
Writes  sprites/rig/<rig>_<piece>.png   one image per body part
        rig-data.js                     joint positions for the JavaScript rig
        tools/rig_debug_<rig>.png       overlay showing every cut (for checking)

How the cut works
-----------------
Each body part is a polygon on the original drawing. A part that rotates
around a joint also gets a round "cap" at that joint (a circle of the
original pixels around the joint). Parent and child both contain the same
cap, so when the child rotates the joint stays filled: no gaps open at the
elbow, knee or ankle. This is the standard cutout-animation technique.

Where one part hid another in the drawing (the side-view arm covers the
back of the torso; the side-view hand covers the thigh), the hidden area is
repainted with the suit colour and its outline, so the part underneath is
whole when the arm swings away.
All coordinates are pixels on the source sprite.
"""
import json
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SUIT = (38, 40, 66, 255)      # sampled suit navy (side view)
INK = (16, 14, 26, 255)       # outline colour

RIGS = {
    "front": {
        "src": "front.png",
        "pieces": {
            # name: polygon, pivot (joint it rotates about), caps [(x, y, r)], end (next joint / contact point)
            # Every limb polygon stops on its joint line; the round cap fills the joint.
            "head": {"poly": [(70, 0), (265, 0), (265, 150), (218, 166), (204, 182), (128, 182), (114, 166), (66, 150)],
                     "pivot": (166, 178)},
            "torso": {"poly": [(122, 158), (212, 158), (262, 186), (298, 212), (306, 250), (288, 282), (262, 300),
                               (260, 360), (264, 470), (262, 505), (240, 522), (166, 534), (92, 522), (70, 505),
                               (68, 470), (72, 360), (70, 300), (46, 282), (28, 250), (36, 212), (72, 186)],
                      "pivot": (166, 500)},
            "upperarm_l": {"poly": [(14, 256), (96, 256), (94, 300), (70, 370), (8, 370), (8, 300)],
                           "pivot": (64, 256), "caps": [(56, 262, 44), (38, 370, 30)], "end": (38, 370)},
            "forearm_l": {"poly": [(6, 370), (70, 370), (70, 470), (64, 500), (66, 584), (52, 604), (28, 604), (4, 566), (0, 480)],
                          "pivot": (38, 370), "caps": [(38, 370, 30)], "end": (32, 548)},
            "forearm_l_cut": {"poly": [(6, 370), (70, 370), (70, 470), (66, 496), (6, 496), (0, 470)],
                              "pivot": (38, 370), "caps": [(38, 370, 30)], "end": (36, 482)},
            "upperarm_r": {"poly": [(238, 256), (322, 256), (330, 300), (330, 370), (266, 370), (258, 300)],
                           "pivot": (270, 256), "caps": [(278, 262, 44), (298, 370, 30)], "end": (298, 370)},
            "forearm_r": {"poly": [(266, 370), (330, 370), (334, 480), (334, 566), (314, 604), (288, 604), (270, 584), (272, 500), (266, 470)],
                          "pivot": (298, 370), "caps": [(298, 370, 30)], "end": (302, 548)},
            "forearm_r_cut": {"poly": [(266, 370), (330, 370), (334, 470), (330, 496), (270, 496), (266, 470)],
                              "pivot": (298, 370), "caps": [(298, 370, 30)], "end": (300, 482)},
            "thigh_l": {"poly": [(66, 466), (166, 466), (166, 532), (150, 610), (126, 706), (60, 706), (62, 600)],
                        "pivot": (118, 500), "caps": [(92, 706, 32)], "end": (92, 706)},
            "shin_l": {"poly": [(60, 706), (126, 706), (124, 790), (118, 868), (118, 932), (104, 979), (0, 979), (0, 950), (44, 880), (52, 790)],
                       "pivot": (92, 706), "caps": [(92, 706, 32)], "end": (84, 975)},
            "thigh_r": {"poly": [(166, 466), (266, 466), (272, 600), (278, 706), (214, 706), (184, 610), (166, 532)],
                        "pivot": (214, 500), "caps": [(246, 706, 32)], "end": (246, 706)},
            "shin_r": {"poly": [(214, 706), (278, 706), (288, 790), (298, 880), (334, 950), (334, 979), (228, 979), (214, 932), (214, 868), (210, 790)],
                       "pivot": (246, 706), "caps": [(246, 706, 32)], "end": (252, 975)},
        },
    },
    "side": {
        "src": "side.png",
        "pieces": {
            "head": {"poly": [(0, 0), (175, 0), (175, 140), (152, 146), (142, 162), (122, 186), (84, 186), (58, 176), (38, 166), (26, 140), (0, 124)],
                     "pivot": (100, 180)},
            # torso: the arm and shoulder pad are removed and repainted as suit + back contour;
            # the bottom follows the hip so the thighs' round tops can cover it
            "torso": {"poly": [(52, 150), (140, 150), (160, 174), (172, 220), (174, 320), (170, 420), (166, 500), (158, 528),
                               (140, 546), (110, 554), (80, 548), (58, 532), (44, 505), (42, 470), (39, 330), (44, 240), (60, 190)],
                      "pivot": (105, 505),
                      "patches": [{"fill": [(96, 204), (118, 190), (148, 184), (170, 214), (170, 500), (104, 506), (92, 420), (92, 300)],
                                   "clear": [(169, 186), (190, 186), (190, 510), (161, 510), (165, 420), (168, 330), (168, 230), (160, 192)],
                                   "line": [(146, 168), (161, 192), (168, 230), (168, 330), (165, 420), (161, 500)]}]},
            "upperarm": {"poly": [(98, 232), (104, 200), (122, 186), (150, 188), (170, 214), (173, 300), (162, 372), (90, 372), (96, 300)],
                         "pivot": (128, 240), "caps": [(126, 372, 36)], "end": (126, 372)},
            "forearm": {"poly": [(88, 372), (164, 372), (164, 398), (162, 398), (162, 450), (142, 476), (128, 500), (124, 562), (100, 572), (64, 542), (58, 500), (70, 470), (78, 440)],
                        "pivot": (126, 372), "caps": [(126, 372, 36)], "end": (94, 526)},
            "forearm_cut": {"poly": [(88, 372), (164, 372), (164, 398), (162, 398), (162, 450), (146, 474), (136, 496), (86, 496), (76, 470), (78, 440)],
                            "pivot": (126, 372), "caps": [(126, 372, 36)], "end": (112, 486)},
            "thigh": {"poly": [(46, 505), (166, 505), (166, 560), (152, 640), (150, 706), (78, 706), (68, 650), (48, 560)],
                      "pivot": (105, 505), "caps": [(105, 505, 60), (114, 706, 36)], "end": (114, 706),
                      "patches": [{"fill": [(56, 474), (128, 474), (130, 570), (98, 580), (58, 552)]}]},
            "shin": {"poly": [(78, 706), (150, 706), (166, 760), (170, 860), (168, 905), (100, 905), (95, 800)],
                     "pivot": (114, 706), "caps": [(114, 706, 36), (135, 905, 35)], "end": (135, 905)},
            "foot": {"poly": [(92, 905), (174, 905), (174, 971), (8, 971), (12, 940), (58, 918), (96, 905)],
                     "pivot": (135, 905), "caps": [(135, 905, 35)], "end": (18, 958)},
        },
    },
    # fists taken from the action pose, swapped onto the wrists
    "action": {
        "src": "action.png",
        "pieces": {
            "fist_side": {"poly": [(34, 278), (100, 278), (102, 350), (34, 352)], "pivot": (95, 318), "end": (44, 312)},
            "fist_front": {"poly": [(322, 36), (435, 36), (435, 152), (322, 152)], "pivot": (330, 124), "end": (395, 78)},
        },
    },
}


def cut(src, piece):
    mask = Image.new("L", src.size, 0)
    d = ImageDraw.Draw(mask)
    d.polygon(piece["poly"], fill=255)
    for x, y, r in piece.get("caps", []):
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    img = src.copy()
    alpha = src.getchannel("A").copy()
    pd, pa = ImageDraw.Draw(img), ImageDraw.Draw(alpha)
    for p in piece.get("patches", []):
        if p.get("fill"):
            pd.polygon(p["fill"], fill=SUIT)
            pa.polygon(p["fill"], fill=255)
        if p.get("clear"):
            pa.polygon(p["clear"], fill=0)
        if p.get("line"):
            pd.line(p["line"], fill=INK, width=3, joint="curve")
            pa.line(p["line"], fill=255, width=3, joint="curve")
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    a = Image.composite(alpha, Image.new("L", src.size, 0), mask)
    out.putalpha(a)
    box = out.getbbox()
    return out.crop(box), box[:2]


def main():
    os.makedirs(os.path.join(ROOT, "sprites", "rig"), exist_ok=True)
    data = {}
    for rig, spec in RIGS.items():
        src = Image.open(os.path.join(ROOT, "sprites", spec["src"])).convert("RGBA")
        debug = Image.new("RGBA", src.size, (40, 40, 60, 255))
        debug.alpha_composite(src)
        dd = ImageDraw.Draw(debug)
        data[rig] = {"size": src.size, "pieces": {}}
        for name, piece in spec["pieces"].items():
            img, (ox, oy) = cut(src, piece)
            rel = f"sprites/rig/{rig}_{name}.png"
            img.save(os.path.join(ROOT, rel), optimize=True)
            data[rig]["pieces"][name] = {
                "src": rel, "offset": [ox, oy], "pivot": list(piece["pivot"]),
                "end": list(piece.get("end", piece["pivot"])),
            }
            dd.polygon(piece["poly"], outline=(0, 255, 120, 255))
            for x, y, r in piece.get("caps", []):
                dd.ellipse([x - r, y - r, x + r, y + r], outline=(255, 220, 0, 255))
            px, py = piece["pivot"]
            dd.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(255, 40, 40, 255))
            if "end" in piece:
                ex, ey = piece["end"]
                dd.ellipse([ex - 3, ey - 3, ex + 3, ey + 3], fill=(60, 160, 255, 255))
        debug.save(os.path.join(HERE, f"rig_debug_{rig}.png"))
    with open(os.path.join(ROOT, "rig-data.js"), "w") as f:
        f.write("/* generated by tools/rig_cut.py — joint data for the cutout puppet */\n")
        f.write("window.RIG_DATA = " + json.dumps(data, indent=1) + ";\n")
    print("pieces written:", sum(len(v["pieces"]) for v in data.values()))


if __name__ == "__main__":
    main()
