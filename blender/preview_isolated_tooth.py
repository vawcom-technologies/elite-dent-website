"""Studio stills of one standing molar. Strips splash camera TRACK_TO / keys.

Renders a 3/4 matching the reference (roots down, occlusal visible) on a pale
studio ground — not the splash blue, so the enamel can be judged.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

OUT_DIR = Path(__file__).resolve().parent / "preview3d"
OUT_DIR.mkdir(parents=True, exist_ok=True)

scene = bpy.context.scene
scene.render.use_motion_blur = False
if hasattr(scene.eevee, "use_motion_blur"):
    scene.eevee.use_motion_blur = False
if hasattr(scene.eevee, "use_gtao"):
    scene.eevee.use_gtao = True
if hasattr(scene.eevee, "use_shadows"):
    scene.eevee.use_shadows = True

tooth = bpy.data.objects.get("PassBy_00") or bpy.data.objects.get("Tooth_00")
if tooth is None:
    raise SystemExit("No PassBy_00 / Tooth_00")

if tooth.animation_data:
    tooth.animation_data_clear()
tooth.parent = None
tooth.hide_render = False
tooth.hide_viewport = False
tooth.hide_set(False)
tooth.location = (0.0, 0.0, 0.0)
tooth.scale = (2.6, 2.6, 2.6)
tooth.rotation_mode = "XYZ"
# Local Y is occlusal; X=90 stands the tooth with roots down (world -Z).
tooth.rotation_euler = (math.radians(90.0), 0.0, math.radians(-28.0))

for obj in list(scene.objects):
    if obj.type == "MESH" and obj.name != tooth.name:
        obj.hide_render = True
        obj.hide_viewport = True
    if obj.type == "LIGHT":
        obj.hide_render = True

cam = scene.camera
for c in list(cam.constraints):
    cam.constraints.remove(c)
if cam.animation_data:
    cam.animation_data_clear()
if cam.data.animation_data:
    cam.data.animation_data_clear()
cam.parent = None
cam.data.lens = 85
cam.data.clip_start = 0.02
cam.data.clip_end = 200.0
cam.data.shift_x = 0.0
cam.data.shift_y = 0.0

# Pale studio surround (camera rays + reflections).
world = scene.world
if world and world.use_nodes:
    for node in world.node_tree.nodes:
        if node.type == "BACKGROUND":
            node.inputs[0].default_value = (0.92, 0.93, 0.94, 1.0)
            node.inputs[1].default_value = 1.0
        if node.type == "VALTORGB":
            for el in node.color_ramp.elements:
                el.color = (0.88, 0.89, 0.90, 1.0)

bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
eval_obj = tooth.evaluated_get(deps)
mesh = eval_obj.to_mesh()
coords = [eval_obj.matrix_world @ v.co for v in mesh.vertices]
eval_obj.to_mesh_clear()
if not coords:
    raise SystemExit("tooth has no vertices")
center = sum(coords, Vector()) / len(coords)
mins = Vector((min(c.x for c in coords), min(c.y for c in coords), min(c.z for c in coords)))
maxs = Vector((max(c.x for c in coords), max(c.y for c in coords), max(c.z for c in coords)))
span = max((maxs - mins).x, (maxs - mins).y, (maxs - mins).z, 0.2)
print(
    f"{tooth.name} verts={len(coords)} center={tuple(round(v, 3) for v in center)} "
    f"span={span:.3f} z=[{mins.z:.2f},{maxs.z:.2f}]"
)

# Soft ground under the root tips.
bpy.ops.mesh.primitive_plane_add(size=span * 6.0, location=(center.x, center.y, mins.z - 0.01))
ground = bpy.context.active_object
ground.name = "StudioGround"
gmat = bpy.data.materials.new("StudioGroundMat")
gmat.use_nodes = True
gnt = gmat.node_tree
for n in list(gnt.nodes):
    gnt.nodes.remove(n)
gout = gnt.nodes.new("ShaderNodeOutputMaterial")
gbsdf = gnt.nodes.new("ShaderNodeBsdfPrincipled")
gbsdf.inputs["Base Color"].default_value = (0.86, 0.86, 0.86, 1.0)
gbsdf.inputs["Roughness"].default_value = 0.78
gnt.links.new(gbsdf.outputs["BSDF"], gout.inputs["Surface"])
ground.data.materials.append(gmat)

def add_area(name, loc, energy, size, look):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.size = size
    data.color = (1.0, 0.99, 0.97)
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (look - loc).to_track_quat("-Z", "Y").to_euler()
    return obj

add_area("StudioKey", center + Vector((-span * 1.3, -span * 1.4, span * 2.2)), 520.0, span * 1.15, center)
add_area("StudioFill", center + Vector((span * 2.0, -span * 0.3, span * 0.4)), 55.0, span * 3.2, center)
add_area("StudioRim", center + Vector((span * 0.2, span * 1.9, span * 0.8)), 180.0, span * 1.2, center)

cam.location = center + Vector((span * 1.15, -span * 1.70, span * 0.78))
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

scene.render.filepath = str(OUT_DIR / "tooth_iso")
scene.render.image_settings.file_format = "PNG"
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
bpy.ops.render.render(write_still=True)
print(f"WROTE {OUT_DIR / 'tooth_iso.png'}")

# Side profile.
cam.location = center + Vector((span * 2.05, 0.05, span * 0.12))
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = str(OUT_DIR / "tooth_side")
bpy.ops.render.render(write_still=True)
print(f"WROTE {OUT_DIR / 'tooth_side.png'}")

# Occlusal / slightly elevated front.
cam.location = center + Vector((span * 0.15, -span * 1.35, span * 1.25))
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = str(OUT_DIR / "tooth_front")
bpy.ops.render.render(write_still=True)
print(f"WROTE {OUT_DIR / 'tooth_front.png'}")
