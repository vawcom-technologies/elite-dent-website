"""Render one framed molar, no splash camera / other teeth."""
from pathlib import Path
import math
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent / "preview3d" / "single_tooth.png"
scene = bpy.context.scene
tooth = bpy.data.objects.get("Tooth_00")
if tooth is None:
    raise SystemExit("Tooth_00 missing")

if tooth.animation_data:
    tooth.animation_data_clear()
tooth.location = (0.0, 0.0, 0.0)
tooth.scale = (1.0, 1.0, 1.0)
tooth.rotation_mode = "XYZ"
# Crown local Y is apical→occlusal. Tip it toward camera so cusps and roots both read.
tooth.rotation_euler = (math.radians(18), math.radians(-28), math.radians(12))

for obj in scene.objects:
    keep = obj is tooth or obj.type in {"LIGHT", "SUN", "CAMERA", "WORLD"}
    obj.hide_render = not keep
    obj.hide_viewport = not keep
tooth.hide_render = False
tooth.hide_viewport = False

bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
eval_obj = tooth.evaluated_get(deps)
mesh = eval_obj.to_mesh()
coords = [eval_obj.matrix_world @ v.co for v in mesh.vertices]
eval_obj.to_mesh_clear()
center = sum(coords, Vector()) / max(len(coords), 1)
mins = Vector((min(c.x for c in coords), min(c.y for c in coords), min(c.z for c in coords)))
maxs = Vector((max(c.x for c in coords), max(c.y for c in coords), max(c.z for c in coords)))
span = max((maxs - mins).x, (maxs - mins).y, (maxs - mins).z)

cam = scene.camera
for c in list(cam.constraints):
    cam.constraints.remove(c)
if cam.animation_data:
    cam.animation_data_clear()
cam.parent = None
cam.location = center + Vector((span * 0.95, -span * 1.55, span * 0.55))
direction = center - cam.location
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
cam.data.lens = 70
cam.data.clip_start = 0.01
cam.data.clip_end = 100.0
cam.data.shift_x = 0.0
cam.data.shift_y = 0.0

scene.frame_set(1)
scene.render.filepath = str(OUT)
scene.render.image_settings.file_format = "PNG"
scene.render.resolution_x = 1080
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
bpy.ops.render.render(write_still=True)
print(f"WROTE {OUT}")
