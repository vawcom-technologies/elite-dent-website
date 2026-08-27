"""
EliteDent splash — Paramount-style tooth fly-through (Blender 5.x)

Beats:
  Slow tunnel: camera banks through multiple angles as teeth rise from below.
  Teeth are 3D renders in flight, then crossfade into 2D logo PNGs as they seat.
  Wordmark fills the page, camera eases to a small centered lockup.

Rebuild:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
    --python blender/build_splash_scene.py
"""

from pathlib import Path
import math
import bpy
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[1]
TOOTH_3D_PATH = ROOT / "assets/images/3drender.png"
TOOTH_2D_PATHS = [
    ROOT / "assets/images/tooth1.png",
    ROOT / "assets/images/tooth2.png",
    ROOT / "assets/images/tooth3.png",
]
SHELL_PATH = ROOT / "assets/images/logowithoutteeth.png"
FULL_LOGO_PATH = ROOT / "assets/images/elitedentlogo.png"
OUT_BLEND = ROOT / "blender/elitedent_splash.blend"

HOLD_AFTER_LOGO = 20
FRAME_END = 220
ARCH_UV = [
    (0.3550, 0.2503),
    (0.3793, 0.2215),
    (0.4036, 0.2007),
    (0.4279, 0.1879),
    (0.4521, 0.1832),
    (0.4764, 0.1865),
    (0.5007, 0.1978),
    (0.5250, 0.2172),
]
SHELL_PLANE_SIZE = 9.5
SHELL_LOC = Vector((0.0, 0.5, 0.0))


def look_at(obj, target: Vector, track="-Z", up="Y"):
    direction = target - obj.location
    if direction.length < 1e-6:
        return
    obj.rotation_euler = direction.to_track_quat(track, up).to_euler()


def shell_half_extents(image_path: Path):
    img = bpy.data.images.load(str(image_path), check_existing=True)
    aspect = img.size[0] / max(img.size[1], 1)
    half_z = SHELL_PLANE_SIZE / 2
    half_x = half_z * aspect
    return half_x, half_z, aspect


def make_image_plane(name: str, image_path: Path, size: float, emit_strength: float = 1.8, blend: str = "CLIP"):
    img = bpy.data.images.load(str(image_path))
    img.pack()
    mat = bpy.data.materials.new(name=f"Mat_{name}")
    if hasattr(mat, "use_nodes"):
        mat.use_nodes = True
    if hasattr(mat, "blend_method"):
        mat.blend_method = blend
    if hasattr(mat, "use_backface_culling"):
        mat.use_backface_culling = False
    if hasattr(mat, "diffuse_color"):
        mat.diffuse_color = (1.0, 1.0, 1.0, 1.0)

    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = emit_strength
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Linear"
    transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    nt.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
    nt.links.new(transparent.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emit.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])

    bpy.ops.mesh.primitive_plane_add(size=size)
    obj = bpy.context.active_object
    obj.name = name
    aspect = img.size[0] / max(img.size[1], 1)
    obj.scale = (aspect, 1.0, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj, emit, mat


def cut_plane_to_alpha(obj, img, threshold: float = 0.12, cuts: int = 40):
    """Delete faces outside the tooth alpha so Solidify follows the silhouette."""
    import bmesh

    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode="OBJECT")

    mesh = obj.data
    w, h = img.size[0], img.size[1]
    pixels = img.pixels[:]  # flat RGBA

    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_lay = bm.loops.layers.uv.active
    if uv_lay is None:
        bm.free()
        return

    dead = []
    for face in bm.faces:
        uvs = [loop[uv_lay].uv for loop in face.loops]
        u = sum(uv.x for uv in uvs) / len(uvs)
        v = sum(uv.y for uv in uvs) / len(uvs)
        px = min(w - 1, max(0, int(u * (w - 1))))
        py = min(h - 1, max(0, int(v * (h - 1))))
        a = pixels[(py * w + px) * 4 + 3]
        if a < threshold:
            dead.append(face)
    if dead:
        bmesh.ops.delete(bm, geom=dead, context="FACES")
    # Drop loose verts left by the cut
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def make_enamel_rim_mat(name: str):
    """Opaque white enamel for Solidify side walls (reads as thickness when banking)."""
    mat = bpy.data.materials.new(name=name)
    if hasattr(mat, "use_nodes"):
        mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    for key, val in (
        ("Base Color", (0.96, 0.97, 0.99, 1.0)),
        ("Roughness", 0.18),
        ("Specular IOR Level", 0.7),
        ("Coat Weight", 0.75),
        ("Coat Roughness", 0.05),
    ):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = val
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def make_morph_tooth(name: str, path_3d: Path, path_2d: Path, size: float = 1.4):
    """Tooth-shaped mesh (alpha-cut) with thickness; lit while flying, morphs to 2D."""
    img3 = bpy.data.images.load(str(path_3d))
    img3.pack()
    img2 = bpy.data.images.load(str(path_2d))
    img2.pack()

    mat = bpy.data.materials.new(name=f"Mat_{name}")
    if hasattr(mat, "use_nodes"):
        mat.use_nodes = True
    if hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    if hasattr(mat, "use_backface_culling"):
        mat.use_backface_culling = False
    if hasattr(mat, "shadow_method"):
        mat.shadow_method = "NONE"

    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    transparent = nt.nodes.new("ShaderNodeBsdfTransparent")

    tex3 = nt.nodes.new("ShaderNodeTexImage")
    tex3.image = img3
    tex3.interpolation = "Linear"

    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(tex3.outputs["Color"], bsdf.inputs["Base Color"])
    for key, val in (
        ("Roughness", 0.16),
        ("Metallic", 0.0),
        ("Specular IOR Level", 0.85),
        ("Coat Weight", 0.85),
        ("Coat Roughness", 0.04),
        ("Alpha", 1.0),
    ):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = val
    if "Emission Color" in bsdf.inputs:
        nt.links.new(tex3.outputs["Color"], bsdf.inputs["Emission Color"])
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 0.4

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.55
    bump.inputs["Distance"].default_value = 0.12
    nt.links.new(tex3.outputs["Color"], bump.inputs["Height"])
    if "Normal" in bsdf.inputs:
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    tex2 = nt.nodes.new("ShaderNodeTexImage")
    tex2.image = img2
    tex2.interpolation = "Linear"
    emit2 = nt.nodes.new("ShaderNodeEmission")
    emit2.inputs["Strength"].default_value = 1.7
    nt.links.new(tex2.outputs["Color"], emit2.inputs["Color"])

    morph = nt.nodes.new("ShaderNodeValue")
    morph.name = "Morph3Dto2D"
    morph.label = "Morph3Dto2D"
    morph.outputs[0].default_value = 0.0

    mix_surf = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(morph.outputs[0], mix_surf.inputs["Fac"])
    nt.links.new(bsdf.outputs["BSDF"], mix_surf.inputs[1])
    nt.links.new(emit2.outputs["Emission"], mix_surf.inputs[2])

    one_minus = nt.nodes.new("ShaderNodeMath")
    one_minus.operation = "SUBTRACT"
    one_minus.inputs[0].default_value = 1.0
    nt.links.new(morph.outputs[0], one_minus.inputs[1])
    a3 = nt.nodes.new("ShaderNodeMath")
    a3.operation = "MULTIPLY"
    nt.links.new(tex3.outputs["Alpha"], a3.inputs[0])
    nt.links.new(one_minus.outputs[0], a3.inputs[1])
    a2 = nt.nodes.new("ShaderNodeMath")
    a2.operation = "MULTIPLY"
    nt.links.new(tex2.outputs["Alpha"], a2.inputs[0])
    nt.links.new(morph.outputs[0], a2.inputs[1])
    a_sum = nt.nodes.new("ShaderNodeMath")
    a_sum.operation = "ADD"
    nt.links.new(a3.outputs[0], a_sum.inputs[0])
    nt.links.new(a2.outputs[0], a_sum.inputs[1])

    mix_tr = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(a_sum.outputs[0], mix_tr.inputs["Fac"])
    nt.links.new(transparent.outputs["BSDF"], mix_tr.inputs[1])
    nt.links.new(mix_surf.outputs["Shader"], mix_tr.inputs[2])
    nt.links.new(mix_tr.outputs["Shader"], out.inputs["Surface"])

    rim = make_enamel_rim_mat(f"Rim_{name}")

    bpy.ops.mesh.primitive_plane_add(size=size)
    obj = bpy.context.active_object
    obj.name = name
    aspect = img3.size[0] / max(img3.size[1], 1)
    obj.scale = (aspect, 1.0, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    obj.data.materials.append(rim)
    for poly in obj.data.polygons:
        poly.use_smooth = True

    cut_plane_to_alpha(obj, img3, threshold=0.12, cuts=56)

    solid = obj.modifiers.new("ToothThick", "SOLIDIFY")
    solid.thickness = 0.24
    solid.offset = 0.0
    if hasattr(solid, "use_even_offset"):
        solid.use_even_offset = True
    if hasattr(solid, "material_offset"):
        solid.material_offset = 1
    if hasattr(solid, "material_offset_rim"):
        solid.material_offset_rim = 1

    bevel = obj.modifiers.new("ToothBevel", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 4
    if hasattr(bevel, "limit_method"):
        bevel.limit_method = "ANGLE"
    if hasattr(bevel, "angle_limit"):
        bevel.angle_limit = math.radians(40)

    smooth = obj.modifiers.new("ToothSmooth", "SMOOTH")
    smooth.factor = 0.6
    smooth.iterations = 12

    return obj, morph, mat


def thicken_image_plane(obj, img, thickness=0.24):
    """Alpha-cut + solidify + bevel for PassBy planes (no displace)."""
    cut_plane_to_alpha(obj, img, threshold=0.12, cuts=56)
    rim = make_enamel_rim_mat(f"Rim_{obj.name}")
    if rim.name not in [m.name for m in obj.data.materials]:
        obj.data.materials.append(rim)
    rim_idx = len(obj.data.materials) - 1

    solid = obj.modifiers.new("ToothThick", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 0.0
    if hasattr(solid, "material_offset"):
        solid.material_offset = rim_idx
    if hasattr(solid, "material_offset_rim"):
        solid.material_offset_rim = rim_idx

    bevel = obj.modifiers.new("ToothBevel", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 4
    if hasattr(bevel, "limit_method"):
        bevel.limit_method = "ANGLE"

    smooth = obj.modifiers.new("ToothSmooth", "SMOOTH")
    smooth.factor = 0.6
    smooth.iterations = 12


def key_morph(morph, frame, value):
    morph.outputs[0].default_value = value
    morph.outputs[0].keyframe_insert("default_value", frame=frame)


def curve_point(i: int, n: int) -> Vector:
    t = i / max(n - 1, 1)
    y = i * 2.6
    x = math.sin(t * math.pi) * 1.6 * (0.85 + t * 0.35)
    z = 2.0 + t * 0.55 + math.cos(t * math.pi * 0.45) * 0.35
    return Vector((x, y, z))


def seat_world(i: int, rig_loc: Vector, rig_scale: float, half_x: float, half_z: float):
    u, v = ARCH_UV[i]
    local = Vector((
        (u - 0.5) * 2 * half_x,
        -0.08,
        (0.5 - v) * 2 * half_z,
    ))
    return rig_loc + local * rig_scale, 0.0


def set_linear_loc(obj):
    if not (obj.animation_data and obj.animation_data.action):
        return
    action = obj.animation_data.action
    fcurves = getattr(action, "fcurves", None)
    if fcurves is None:
        try:
            fcurves = action.layers[0].strips[0].channelbag(action.slots[0]).fcurves
        except Exception:
            fcurves = []
    for fcurve in fcurves or []:
        if fcurve.data_path == "location":
            for kp in fcurve.keyframe_points:
                kp.interpolation = "LINEAR"


def soften(action):
    if action is None:
        return
    fcurves = getattr(action, "fcurves", None)
    if fcurves is None:
        try:
            fcurves = action.layers[0].strips[0].channelbag(action.slots[0]).fcurves
        except Exception:
            fcurves = []
    for fcurve in fcurves or []:
        for kp in fcurve.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.handle_left_type = "AUTO_CLAMPED"
            kp.handle_right_type = "AUTO_CLAMPED"


def kf_loc_rot_scale(obj, frame):
    obj.keyframe_insert("location", frame=frame)
    obj.keyframe_insert("rotation_euler", frame=frame)
    obj.keyframe_insert("scale", frame=frame)


# --- reset ---
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
engines = {item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
if "BLENDER_EEVEE_NEXT" in engines:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
elif "BLENDER_EEVEE" in engines:
    scene.render.engine = "BLENDER_EEVEE"
else:
    scene.render.engine = "CYCLES"

scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = FRAME_END

scene.world = bpy.data.worlds.new("SplashWorld")
if hasattr(scene.world, "use_nodes"):
    scene.world.use_nodes = True
nt_world = scene.world.node_tree
bg = next((n for n in nt_world.nodes if n.type == "BACKGROUND"), None)
if bg is None:
    bg = nt_world.nodes.new("ShaderNodeBackground")
    out = next((n for n in nt_world.nodes if n.type == "OUTPUT_WORLD"), None)
    if out:
        nt_world.links.new(bg.outputs[0], out.inputs[0])


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


bg.inputs[0].default_value = (
    srgb_to_linear(0x4A / 255),
    srgb_to_linear(0x90 / 255),
    srgb_to_linear(0xE2 / 255),
    1.0,
)
bg.inputs[1].default_value = 1.0
if hasattr(scene, "view_settings"):
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

aim = bpy.data.objects.new("CamAim", None)
scene.collection.objects.link(aim)
aim.empty_display_size = 0.35

if not TOOTH_3D_PATH.exists():
    raise FileNotFoundError(TOOTH_3D_PATH)
for p in TOOTH_2D_PATHS:
    if not p.exists():
        raise FileNotFoundError(p)
if not SHELL_PATH.exists():
    raise FileNotFoundError(SHELL_PATH)

# --- teeth (3D↔2D morph planes) ---
teeth = []
morphs = []
base_sizes = []
count = len(ARCH_UV)
cam_start = Vector((0.25, -10.0, 7.0))
half_x, half_z, shell_aspect = shell_half_extents(SHELL_PATH)

for i in range(count):
    path_2d = TOOTH_2D_PATHS[i % len(TOOTH_2D_PATHS)]
    size = 1.55 if i == 0 else 1.35
    obj, morph, _ = make_morph_tooth(f"Tooth_{i:02d}", TOOTH_3D_PATH, path_2d, size=size)
    obj.location = curve_point(i, count)
    look_at(obj, cam_start, track="Z", up="Y")
    teeth.append(obj)
    morphs.append(morph)
    base_sizes.append(Vector(obj.scale))

rig_rest = SHELL_LOC.copy()
rig_rest_s = 1.0

shell, shell_emit, shell_mat = make_image_plane(
    "LogoShell", SHELL_PATH, size=SHELL_PLANE_SIZE, emit_strength=1.7, blend="CLIP"
)
shell.rotation_euler = Euler((math.radians(90), 0, 0), "XYZ")

# Slower sequential landings
DEPTH = [0, 1, 2]
FLYIN = [3, 4, 5, 6, 7]
DEPTH_START = 12
DEPTH_STAGGER = 8
DEPTH_FLIGHT = 52
FLYIN_GATE = DEPTH_START + 6
FLYIN_STAGGER = 8
FLYIN_FLIGHT = 62

last_land = FLYIN_GATE + (len(FLYIN) - 1) * FLYIN_STAGGER + FLYIN_FLIGHT
# Wordmark stays hidden through the tooth tunnel, then slides into place near the end
LOGO_IN_START = last_land - 38
LOGO_ENTER = LOGO_IN_START + 16
LOGO_IN_MID = last_land - 6
LOGO_IN_END = last_land + 10
FRAME_END = LOGO_IN_END + HOLD_AFTER_LOGO
scene.frame_end = FRAME_END

# Off-screen below → into frame → final seat (never visible at the start)
rig_below = Vector((rig_rest.x, rig_rest.y, -6.0))
rig_enter = Vector((rig_rest.x, rig_rest.y, -1.4))

for f, hidden in (
    (1, True),
    (LOGO_IN_START - 1, True),
    (LOGO_IN_START, False),
    (FRAME_END, False),
):
    shell.hide_viewport = hidden
    shell.hide_render = hidden
    shell.keyframe_insert("hide_viewport", frame=f)
    shell.keyframe_insert("hide_render", frame=f)

# Belt-and-suspenders: emission 0 while hidden (hide_render can fail in some EEVEE paths)
shell_emit.inputs["Strength"].default_value = 0.0
shell_emit.inputs["Strength"].keyframe_insert("default_value", frame=1)
shell_emit.inputs["Strength"].keyframe_insert("default_value", frame=LOGO_IN_START - 1)
shell_emit.inputs["Strength"].default_value = 1.7
shell_emit.inputs["Strength"].keyframe_insert("default_value", frame=LOGO_IN_START)
shell_emit.inputs["Strength"].keyframe_insert("default_value", frame=FRAME_END)

shell.scale = (rig_rest_s, rig_rest_s, rig_rest_s)
for f, loc in (
    (1, rig_below),
    (LOGO_IN_START, rig_below),
    (LOGO_ENTER, rig_enter),
    (LOGO_IN_MID, rig_rest.lerp(rig_enter, 0.15)),
    (LOGO_IN_END, rig_rest),
    (FRAME_END, rig_rest),
):
    shell.location = loc
    shell.scale = (rig_rest_s, rig_rest_s, rig_rest_s)
    shell.keyframe_insert("location", frame=f)
    shell.keyframe_insert("scale", frame=f)

soften(shell.animation_data.action if shell.animation_data else None)
soften(shell_emit.id_data.animation_data.action if shell_emit.id_data.animation_data else None)

# --- camera: Paramount multi-angle bank while pushing through the tooth stream ---
cam_data = bpy.data.cameras.new("SplashCam")
cam_data.lens = 34
cam_data.clip_start = 0.05
cam_data.clip_end = 500
cam = bpy.data.objects.new("SplashCam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

track = cam.constraints.new(type="TRACK_TO")
track.target = aim
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"

logo_aim = SHELL_LOC + Vector((0.0, 0.0, 1.0))
tunnel_aim = Vector((0.0, 1.2, 1.8))
cam_fill = Vector((0.0, -12.0, 0.65))
cam_end = Vector((0.0, -26.0, 0.95))

cam_beats = [
    # Multi-angle tunnel while teeth fly (wordmark still hidden)
    (1, Vector((4.2, -26.0, 8.2)), Vector((-2.5, 7.0, 1.5)), 38),
    (DEPTH_START, Vector((3.0, -23.0, 6.4)), Vector((-1.5, 5.5, 2.0)), 36),
    (FLYIN_GATE, Vector((-3.5, -20.5, 3.2)), Vector((1.2, 4.0, 2.4)), 34),
    (FLYIN_GATE + 2 * FLYIN_STAGGER, Vector((4.0, -17.5, 4.8)), Vector((-1.8, 2.5, 1.2)), 33),
    (FLYIN_GATE + 4 * FLYIN_STAGGER, Vector((-2.8, -15.0, 1.6)), Vector((0.6, 1.5, 2.2)), 34),
    (LOGO_IN_START - 8, Vector((-1.2, -13.5, 1.0)), tunnel_aim, 34),
    # Wordmark slides up into place; camera fills then pulls to small lockup
    (LOGO_IN_START, cam_fill.copy(), logo_aim, 35),
    (LOGO_ENTER, cam_fill.lerp(cam_end, 0.2), logo_aim, 35),
    (LOGO_IN_MID, cam_fill.lerp(cam_end, 0.55), logo_aim, 35),
    (LOGO_IN_END, cam_end.copy(), logo_aim, 35),
    (FRAME_END, cam_end.copy(), logo_aim, 35),
]


def cam_loc_at(frame: int) -> Vector:
    if frame <= cam_beats[0][0]:
        return cam_beats[0][1].copy()
    for i in range(1, len(cam_beats)):
        f0, loc0, _, _ = cam_beats[i - 1]
        f1, loc1, _, _ = cam_beats[i]
        if frame <= f1:
            u = (frame - f0) / max(f1 - f0, 1)
            return loc0.lerp(loc1, u)
    return cam_beats[-1][1].copy()


for frame, loc, aim_loc, lens in cam_beats:
    cam.location = loc
    aim.location = aim_loc
    cam.keyframe_insert("location", frame=frame)
    aim.keyframe_insert("location", frame=frame)
    cam_data.lens = lens
    cam_data.keyframe_insert("lens", frame=frame)

set_linear_loc(cam)
soften(aim.animation_data.action if aim.animation_data else None)
soften(cam_data.animation_data.action if cam_data.animation_data else None)

# --- tooth motion ---
logo_width = half_x * 2
base_tooth_w = logo_width * 0.034

for i, obj in enumerate(teeth):
    morph = morphs[i]
    seat, _ = seat_world(i, rig_rest, rig_rest_s, half_x, half_z)
    scale = (base_tooth_w * rig_rest_s) / max(obj.dimensions.x, 1e-3)
    side = -1.0 if i % 2 == 0 else 1.0

    if i in FLYIN:
        fi = FLYIN.index(i)
        start_f = FLYIN_GATE + fi * FLYIN_STAGGER
        rise_f = start_f + 20
        tumble_f = start_f + int(FLYIN_FLIGHT * 0.42)
        mid_f = start_f + int(FLYIN_FLIGHT * 0.62)
        fade_f = start_f + int(FLYIN_FLIGHT * 0.78)
        land_f = start_f + FLYIN_FLIGHT
    else:
        di = DEPTH.index(i)
        start_f = DEPTH_START + di * DEPTH_STAGGER
        rise_f = start_f + 18
        tumble_f = start_f + int(DEPTH_FLIGHT * 0.4)
        mid_f = start_f + int(DEPTH_FLIGHT * 0.6)
        fade_f = start_f + int(DEPTH_FLIGHT * 0.78)
        land_f = start_f + DEPTH_FLIGHT
        fi = di
        side = -1.0 if di % 2 == 0 else 1.0

    cam_l = cam_loc_at(start_f)
    bottom = Vector((seat.x * 0.4, cam_l.y + 2.8, cam_l.z - 7.8))
    rise = Vector((seat.x * 0.55 + side * 0.35, cam_l.y + 4.2, cam_l.z - 3.0))
    # Tumble pose — offset so camera banks catch a side/3Q view
    tumble = Vector((seat.x * 0.7 + side * 1.1, -2.2, seat.z * 0.2 + side * 0.6))
    mid = Vector((seat.x * 0.88, -0.6, seat.z * 0.5))

    for f, hidden in ((1, True), (start_f - 1, True), (start_f, False)):
        obj.hide_viewport = hidden
        obj.hide_render = hidden
        obj.keyframe_insert("hide_viewport", frame=f)
        obj.keyframe_insert("hide_render", frame=f)

    # 3D look while flying
    key_morph(morph, start_f, 0.0)
    key_morph(morph, fade_f, 0.15)
    key_morph(morph, land_f, 1.0)
    key_morph(morph, FRAME_END, 1.0)

    obj.location = bottom
    look_at(obj, rise, track="Z", up="Y")
    obj.rotation_euler.rotate_axis("X", math.radians(25))
    obj.scale = Vector((scale * 1.4, scale * 1.4, scale * 1.4))
    kf_loc_rot_scale(obj, start_f)

    obj.location = rise
    look_at(obj, tumble, track="Z", up="Y")
    obj.rotation_euler.rotate_axis("Y", math.radians(side * 35))
    obj.scale = Vector((scale * 1.65, scale * 1.65, scale * 1.65))
    kf_loc_rot_scale(obj, rise_f)

    obj.location = tumble
    look_at(obj, seat, track="Z", up="Y")
    obj.rotation_euler.rotate_axis("X", math.radians(-20))
    obj.rotation_euler.rotate_axis("Z", math.radians(side * 18))
    obj.scale = Vector((scale * 1.35, scale * 1.35, scale * 1.35))
    kf_loc_rot_scale(obj, tumble_f)

    obj.location = mid
    look_at(obj, seat, track="Z", up="Y")
    obj.scale = Vector((scale * 1.15, scale * 1.15, scale * 1.15))
    kf_loc_rot_scale(obj, mid_f)

    # Seat as flat 2D logo tooth
    obj.location = seat
    obj.rotation_euler = Euler((math.radians(90), 0, 0), "XYZ")
    obj.scale = Vector((scale, scale, scale))
    kf_loc_rot_scale(obj, land_f)
    kf_loc_rot_scale(obj, FRAME_END)

    set_linear_loc(obj)
    soften(morph.id_data.animation_data.action if morph.id_data.animation_data else None)

# Pass-by streak (stays 3D, with thickness)
obj, _, pass_mat = make_image_plane("PassBy_00", TOOTH_3D_PATH, size=1.2, blend="BLEND")
# Swap flat emission for lit Principled so banks catch highlights
nt = pass_mat.node_tree
tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
mix = next(n for n in nt.nodes if n.type == "MIX_SHADER")
emit = next(n for n in nt.nodes if n.type == "EMISSION")
bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
if "Roughness" in bsdf.inputs:
    bsdf.inputs["Roughness"].default_value = 0.2
if "Coat Weight" in bsdf.inputs:
    bsdf.inputs["Coat Weight"].default_value = 0.6
for link in list(nt.links):
    if link.to_node == mix and link.from_node == emit:
        nt.links.remove(link)
nt.links.new(bsdf.outputs["BSDF"], mix.inputs[2])
if "Roughness" in bsdf.inputs:
    bsdf.inputs["Roughness"].default_value = 0.14
if "Coat Weight" in bsdf.inputs:
    bsdf.inputs["Coat Weight"].default_value = 0.9
if "Coat Roughness" in bsdf.inputs:
    bsdf.inputs["Coat Roughness"].default_value = 0.04
bump = nt.nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.5
bump.inputs["Distance"].default_value = 0.12
nt.links.new(tex.outputs["Color"], bump.inputs["Height"])
if "Normal" in bsdf.inputs:
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
thicken_image_plane(obj, tex.image, thickness=0.24)

appear = FLYIN_GATE + 4
cam_l = cam_loc_at(appear)
for f, hidden in ((1, True), (appear - 1, True), (appear, False), (appear + 42, False), (appear + 44, True)):
    obj.hide_viewport = hidden
    obj.hide_render = hidden
    obj.keyframe_insert("hide_viewport", frame=f)
    obj.keyframe_insert("hide_render", frame=f)
obj.location = Vector((2.2, cam_l.y + 2.0, cam_l.z - 7.0))
look_at(obj, Vector((0, cam_l.y + 6, cam_l.z)), track="Z", up="Y")
obj.scale = Vector((2.0, 2.0, 2.0))
kf_loc_rot_scale(obj, appear)
obj.location = Vector((-0.5, cam_l.y + 5.0, cam_l.z - 1.5))
obj.rotation_euler.rotate_axis("Y", math.radians(-40))
obj.scale = Vector((2.4, 2.4, 2.4))
kf_loc_rot_scale(obj, appear + 16)
obj.location = Vector((-2.5, 8.0, 3.0))
obj.scale = Vector((0.2, 0.2, 0.2))
kf_loc_rot_scale(obj, appear + 42)
set_linear_loc(obj)

for obj in teeth:
    assert obj.animation_data and obj.animation_data.action, f"{obj.name} has no action"

scene.frame_set(1)

# Specular lights — keep them punchy but not washing the bake to pure white
bpy.ops.object.light_add(type="AREA", location=(5.5, -6, 6))
key = bpy.context.active_object
key.name = "KeyLight"
key.data.energy = 700
key.data.size = 2.8
look_at(key, Vector((0, 0, 1.5)), track="-Z", up="Y")

bpy.ops.object.light_add(type="AREA", location=(-6, -4, 2.5))
fill = bpy.context.active_object
fill.name = "FillLight"
fill.data.energy = 180
fill.data.size = 6
look_at(fill, Vector((0, 0, 1.2)), track="-Z", up="Y")

bpy.ops.object.light_add(type="AREA", location=(0.5, 4, 5))
rim = bpy.context.active_object
rim.name = "RimLight"
rim.data.energy = 520
rim.data.size = 3.5
look_at(rim, Vector((0, -2, 1)), track="-Z", up="Y")

bpy.ops.object.light_add(type="POINT", location=(-4, -8, 4))
spec = bpy.context.active_object
spec.name = "SpecSweep"
spec.data.energy = 650
spec.data.shadow_soft_size = 0.5
spec.location = Vector((-5, -9, 5))
spec.keyframe_insert("location", frame=1)
spec.location = Vector((5, 2, 3))
spec.keyframe_insert("location", frame=max(60, FRAME_END // 2))
spec.location = Vector((-2, 8, 4))
spec.keyframe_insert("location", frame=FRAME_END)

scene.render.filepath = str(ROOT / "blender/renders/splash_")
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
(ROOT / "blender/renders").mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
print(f"Saved {OUT_BLEND}")
print(f"Frames 1–{FRAME_END}: multi-angle tunnel → 3D→2D morph → logo @{LOGO_IN_START}–{LOGO_IN_END}")
print(f"Fly-ins from @{FLYIN_GATE}; last tooth land @{last_land}")
print(f"Rest seat0 {seat_world(0, rig_rest, rig_rest_s, half_x, half_z)[0][:]}")
