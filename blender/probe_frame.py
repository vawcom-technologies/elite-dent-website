"""Print what each visible object covers on screen at a given frame.

    <blender> -b blender/elitedent_splash.blend --python blender/probe_frame.py -- 96

Reports camera distance and normalised-device extent per object, so an object that
unexpectedly fills the lens is easy to spot without rendering test images.
"""

import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
frames = [int(a) for a in argv] or [bpy.context.scene.frame_current]

scene = bpy.context.scene
cam = scene.camera
deps = bpy.context.evaluated_depsgraph_get()

for frame in frames:
    scene.frame_set(frame)
    deps.update()
    print(f"\n=== frame {frame} ===")
    print(f"camera at {tuple(round(v, 2) for v in cam.matrix_world.translation)}")
    rows = []
    for obj in scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        ev = obj.evaluated_get(deps)
        corners = [ev.matrix_world @ Vector(c) for c in ev.bound_box] if False else [
            obj.matrix_world @ __import__("mathutils").Vector(c) for c in obj.bound_box
        ]
        ndc = [world_to_camera_view(scene, cam, c) for c in corners]
        xs = [p.x for p in ndc]
        ys = [p.y for p in ndc]
        zs = [p.z for p in ndc]
        if max(zs) <= 0:
            continue
        w = max(xs) - min(xs)
        h = max(ys) - min(ys)
        dist = (obj.matrix_world.translation - cam.matrix_world.translation).length
        onscreen = max(xs) > 0 and min(xs) < 1 and max(ys) > 0 and min(ys) < 1
        rows.append((w * h, obj.name, dist, w, h, onscreen))

    for area, name, dist, w, h, onscreen in sorted(rows, reverse=True):
        flag = "" if onscreen else "   (off-frame)"
        print(f"  {name:<12} dist {dist:6.2f}  screen {w * 100:6.1f}% x {h * 100:6.1f}%{flag}")
