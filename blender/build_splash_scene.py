"""
EliteDent splash — Paramount-style tooth fly-through (Blender 5.x)

Beats:
  Slow tunnel: camera banks through multiple angles as teeth rise from below.
  Teeth are solid 3D enamel meshes in flight, then flatten and crossfade into the
  2D logo PNGs as they seat, so the finished lockup matches the logo artwork.
  Wordmark fills the page, camera eases to a small centered lockup.

Rebuild:
  /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --background \\
    --python blender/build_splash_scene.py
"""

from pathlib import Path
import math
import bpy
from mathutils import Vector, Euler, Quaternion

ROOT = Path(__file__).resolve().parents[1]
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
# Beats below are authored at 30fps, then retimed to RENDER_FPS at the end.
BEAT_FPS = 30
RENDER_FPS = 60
# Depth scale the crown collapses to as it seats into the flat logo tooth.
SEAT_FLATTEN = 0.02
# Flight is keyed every half beat, which lands on every frame once retimed to
# RENDER_FPS. Dense keys mean playback is exactly the sampled curve.
SAMPLE_STEP = 0.5
# Fraction of the flight where the crown hands over to the flat logo tooth.
# Starts earlier so the 3D→2D settle is a long ease, not a late pop.
MORPH_START = 0.64
# Brightening toward logo white starts earlier than the handover.
SEAT_LIFT_START = 0.34
# Crowns run larger while airborne so the modelling reads, easing to logo size.
FLIGHT_SCALE = [
    (0.00, 1.48),
    (0.18, 1.72),
    (0.46, 1.38),
    (0.68, 1.14),
    (0.86, 1.03),
    (1.00, 1.00),
]
# Closest a crown may come to the lens. Well inside the ~13 units the seats sit at,
# so the landing and the logo lockup are untouched.
MIN_CAM_DIST = 4.2
# Whole turns per tooth, so every roll unwinds to the seated pose exactly.
TOOTH_TURNS = [1, 2, 1, 1, 2, 1, 2, 1]
# One dial for the whole rig. Enamel has to sit below clipping or the shading
# gradient disappears and the crowns read as flat white cut-outs again; aim for a
# median around 0.8 with only the specular hits approaching 1.0.
LIGHT_GAIN = 1.0
# Ambient from the reflection environment. Higher lifts the shadow side and flattens.
ENV_STRENGTH = 0.50
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


def set_blend(mat, mode: str):
    """Alpha mode across EEVEE Legacy (blend_method) and EEVEE Next (render method)."""
    if hasattr(mat, "blend_method"):
        try:
            mat.blend_method = mode
        except (TypeError, ValueError):
            pass
    if hasattr(mat, "surface_render_method"):
        try:
            mat.surface_render_method = "BLENDED" if mode == "BLEND" else "DITHERED"
        except (TypeError, ValueError):
            pass


def look_at(obj, target: Vector, track="-Z", up="Y"):
    direction = target - obj.location
    if direction.length < 1e-6:
        return
    obj.rotation_euler = direction.to_track_quat(track, up).to_euler()


AXES = {"X": Vector((1.0, 0.0, 0.0)), "Y": Vector((0.0, 1.0, 0.0)), "Z": Vector((0.0, 0.0, 1.0))}


def aim_quat(loc: Vector, target: Vector, track="Z", up="Y") -> Quaternion:
    direction = target - loc
    if direction.length < 1e-6:
        return Quaternion((1.0, 0.0, 0.0, 0.0))
    return direction.to_track_quat(track, up)


def spin(axis: str, degrees: float) -> Quaternion:
    return Quaternion(AXES[axis], math.radians(degrees))


def iter_fcurves(action):
    """F-curves for both legacy and slotted (Blender 4.4+) actions."""
    if action is None:
        return []
    fcurves = getattr(action, "fcurves", None)
    if fcurves:
        return list(fcurves)
    collected = []
    try:
        for slot in action.slots:
            for layer in action.layers:
                for strip in layer.strips:
                    bag = strip.channelbag(slot)
                    if bag:
                        collected.extend(bag.fcurves)
    except Exception:
        pass
    return collected


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
    set_blend(mat, blend)
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


def _profile(v: float, points):
    """Smoothstep lookup over [(v, value), ...] so the silhouette has no kinks."""
    if v <= points[0][0]:
        return points[0][1]
    for i in range(1, len(points)):
        v0, a0 = points[i - 1]
        v1, a1 = points[i]
        if v <= v1:
            t = (v - v0) / max(v1 - v0, 1e-6)
            t = t * t * (3.0 - 2.0 * t)
            return a0 + (a1 - a0) * t
    return points[-1][1]


MOLAR_STL = ROOT / "blender/meshes/molar.stl"


def _load_study_molar():
    """Import the Printables anatomical molar and drop the print stand.

    The STL is a teaching model (tooth 16) sitting on a 2 mm plate that is a
    separate island, with a few millimetres of fused foot at the root tips.
    Local axes after this: X mesial–distal, Y apical→occlusal, Z buccal(+).
    """
    if not MOLAR_STL.exists():
        raise FileNotFoundError(MOLAR_STL)

    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.wm.stl_import(filepath=str(MOLAR_STL))
    obj = bpy.context.selected_objects[0]

    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    seen = set()
    islands = []
    for vert in bm.verts:
        if vert.index in seen:
            continue
        stack = [vert]
        island = []
        seen.add(vert.index)
        while stack:
            cur = stack.pop()
            island.append(cur)
            for edge in cur.link_edges:
                other = edge.other_vert(cur)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        islands.append(island)
    main = max(islands, key=len)
    drop = [v for island in islands if island is not main for v in island]
    if drop:
        bmesh.ops.delete(bm, geom=drop, context="VERTS")

    zs = [v.co.z for v in bm.verts]
    zmin = min(zs)
    # Plate is 2 mm thick at min Z; cut a hair above so fused feet go with it.
    zcut = zmin + 3.0
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    bmesh.ops.bisect_plane(
        bm,
        geom=geom,
        dist=0.01,
        plane_co=Vector((0.0, 0.0, zcut)),
        plane_no=Vector((0.0, 0.0, 1.0)),
        clear_inner=True,
        clear_outer=False,
    )
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # STL +Z is occlusal. Splash local +Y is occlusal.
    for vert in bm.verts:
        x, y, z = vert.co
        vert.co = Vector((x, z, -y))

    leftover = obj.data
    mesh = bpy.data.meshes.new("MolarSource")
    bm.to_mesh(mesh)
    bm.free()
    bpy.data.objects.remove(obj, do_unlink=True)
    if leftover and leftover.users == 0:
        bpy.data.meshes.remove(leftover)
    if len(mesh.vertices) < 32:
        raise RuntimeError("molar STL produced an empty mesh after trimming the stand")
    return mesh


_MOLAR_SRC = None
_MOLAR_ASPECT = None


def build_crown_mesh(name: str):
    """Cached maxillary molar, width-normalised to 1. Local Y is occlusal."""
    global _MOLAR_SRC, _MOLAR_ASPECT
    if _MOLAR_SRC is None:
        src = _load_study_molar()
        xs = [v.co.x for v in src.vertices]
        ys = [v.co.y for v in src.vertices]
        zs = [v.co.z for v in src.vertices]
        span_x = max(xs) - min(xs)
        k = 1.0 / max(span_x, 1e-6)
        cx = (max(xs) + min(xs)) * 0.5
        cy = (max(ys) + min(ys)) * 0.5
        cz = (max(zs) + min(zs)) * 0.5
        for vert in src.vertices:
            vert.co.x = (vert.co.x - cx) * k
            vert.co.y = (vert.co.y - cy) * k
            vert.co.z = (vert.co.z - cz) * k
        for poly in src.polygons:
            poly.use_smooth = True
        src.update()
        _MOLAR_SRC = src
        _MOLAR_ASPECT = (max(ys) - min(ys)) / max(span_x, 1e-6)
        print(
            f"molar verts={len(src.vertices)} aspect={_MOLAR_ASPECT:.2f} "
            f"y[{(min(ys)-cy)*k:.2f},{(max(ys)-cy)*k:.2f}]"
        )
    mesh = _MOLAR_SRC.copy()
    mesh.name = name
    return mesh, _MOLAR_ASPECT


def _organic_subsurf(obj):
    # Anatomical STL is already dense; extra subsurf balloons the mesh for no gain.
    return


def _enamel_bsdf(nt):
    """Opaque white enamel lit entirely by the rig — no emission floor.

    The previous build lifted every surface point with a constant emission so the
    crowns matched the logo white. That also erased the shading gradient, which is
    why they read as flat cut-outs. Brightness now comes from the lights, so the
    form, the lobe grooves and the incisal ridge all show.
    """
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    for key, val in (
        # Satin ivory enamel — not glossy plastic. Crown is cooler; roots warmer.
        ("Base Color", (0.96, 0.94, 0.90, 1.0)),
        ("Metallic", 0.0),
        ("Roughness", 0.32),
        ("IOR", 1.62),
        ("Specular IOR Level", 0.38),
        ("Coat Weight", 0.16),
        ("Coat Roughness", 0.22),
        ("Coat IOR", 1.45),
        ("Subsurface Weight", 0.58),
        ("Subsurface Scale", 0.12),
        ("Emission Color", (0.97, 0.96, 0.93, 1.0)),
        ("Emission Strength", 0.0),
        ("Alpha", 1.0),
    ):
        if key in bsdf.inputs:
            try:
                bsdf.inputs[key].default_value = val
            except (TypeError, ValueError):
                pass
    if "Subsurface Radius" in bsdf.inputs:
        try:
            bsdf.inputs["Subsurface Radius"].default_value = (0.9, 0.45, 0.22)
        except (TypeError, ValueError):
            pass

    # Generated Y: 0 = root tips (warm dentin), 1 = occlusal (bright enamel).
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.86, 0.72, 0.52, 1.0)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (0.97, 0.96, 0.93, 1.0)
    mid = ramp.color_ramp.elements.new(0.48)
    mid.color = (0.93, 0.88, 0.78, 1.0)
    nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    # Soft roughness, no crunchy bump — the reference is smooth satin.
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 8.0
    if "Detail" in noise.inputs:
        noise.inputs["Detail"].default_value = 2.0
    rough = nt.nodes.new("ShaderNodeMapRange")
    rough.inputs["From Min"].default_value = 0.0
    rough.inputs["From Max"].default_value = 1.0
    rough.inputs["To Min"].default_value = 0.26
    rough.inputs["To Max"].default_value = 0.40
    nt.links.new(noise.outputs["Fac"], rough.inputs["Value"])
    nt.links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])

    # Grazing-angle lift so white enamel still separates from the splash blue.
    facing = nt.nodes.new("ShaderNodeLayerWeight")
    facing.inputs["Blend"].default_value = 0.38
    edge = nt.nodes.new("ShaderNodeMath")
    edge.operation = "POWER"
    edge.inputs[1].default_value = 3.0
    nt.links.new(facing.outputs["Facing"], edge.inputs[0])
    edge_amt = nt.nodes.new("ShaderNodeMath")
    edge_amt.operation = "MULTIPLY"
    edge_amt.inputs[1].default_value = 0.12
    nt.links.new(edge.outputs[0], edge_amt.inputs[0])
    if "Emission Strength" in bsdf.inputs:
        nt.links.new(edge_amt.outputs[0], bsdf.inputs["Emission Strength"])
    return bsdf, edge_amt


def make_solid(mat):
    """Closed meshes must cull back faces or EEVEE blending shows their interior."""
    if hasattr(mat, "use_backface_culling"):
        mat.use_backface_culling = False
    if hasattr(mat, "show_transparent_back"):
        mat.show_transparent_back = False


def make_morph_tooth(name: str, path_2d: Path):
    """Solid enamel crown in flight that crossfades into the flat 2D logo tooth."""
    img2 = bpy.data.images.load(str(path_2d))
    img2.pack()
    mesh, mesh_aspect = build_crown_mesh(f"Mesh_{name}")

    mat = bpy.data.materials.new(name=f"Mat_{name}")
    if hasattr(mat, "use_nodes"):
        mat.use_nodes = True
    set_blend(mat, "BLEND")
    make_solid(mat)
    if hasattr(mat, "shadow_method"):
        mat.shadow_method = "NONE"

    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
    bsdf, edge_amt = _enamel_bsdf(nt)

    # A shaded crown is darker than the flat logo tooth it hands over to, so without
    # this the last arrival pops from grey to white. Brightening toward logo white
    # over the approach makes each tooth simply light up as it locks into the arch.
    lift = nt.nodes.new("ShaderNodeValue")
    lift.name = "SeatLift"
    lift.label = "SeatLift"
    lift.outputs[0].default_value = 0.0
    lift_amt = nt.nodes.new("ShaderNodeMath")
    lift_amt.operation = "MULTIPLY"
    lift_amt.inputs[1].default_value = 1.40
    nt.links.new(lift.outputs[0], lift_amt.inputs[0])
    emit_total = nt.nodes.new("ShaderNodeMath")
    emit_total.operation = "ADD"
    nt.links.new(edge_amt.outputs[0], emit_total.inputs[0])
    nt.links.new(lift_amt.outputs[0], emit_total.inputs[1])
    if "Emission Strength" in bsdf.inputs:
        nt.links.new(emit_total.outputs[0], bsdf.inputs["Emission Strength"])

    # Project the logo tooth onto the crown's front view at its own aspect, so the
    # seated frame matches the artwork exactly.
    png_aspect = img2.size[1] / max(img2.size[0], 1)
    scale_y = mesh_aspect / max(png_aspect, 1e-6)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, scale_y, 1.0)
    mapping.inputs["Location"].default_value = (0.0, 0.5 - 0.5 * scale_y, 0.0)
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])

    tex2 = nt.nodes.new("ShaderNodeTexImage")
    tex2.image = img2
    tex2.interpolation = "Linear"
    tex2.extension = "CLIP"
    nt.links.new(mapping.outputs["Vector"], tex2.inputs["Vector"])

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

    # The crown is wider than the logo tooth, so dissolve the surrounding hull well
    # before the colour crossfade ends — otherwise it lingers as a grey ghost.
    hull = nt.nodes.new("ShaderNodeMapRange")
    hull.inputs["From Min"].default_value = 0.0
    hull.inputs["From Max"].default_value = 0.90
    hull.inputs["To Min"].default_value = 0.0
    hull.inputs["To Max"].default_value = 1.0
    hull.clamp = True
    nt.links.new(morph.outputs[0], hull.inputs["Value"])

    # alpha = 1 - hull * (1 - logo alpha): opaque in flight, logo cut-out when seated.
    inv_png = nt.nodes.new("ShaderNodeMath")
    inv_png.operation = "SUBTRACT"
    inv_png.inputs[0].default_value = 1.0
    nt.links.new(tex2.outputs["Alpha"], inv_png.inputs[1])
    scaled = nt.nodes.new("ShaderNodeMath")
    scaled.operation = "MULTIPLY"
    nt.links.new(hull.outputs["Result"], scaled.inputs[0])
    nt.links.new(inv_png.outputs[0], scaled.inputs[1])
    alpha = nt.nodes.new("ShaderNodeMath")
    alpha.operation = "SUBTRACT"
    alpha.inputs[0].default_value = 1.0
    nt.links.new(scaled.outputs[0], alpha.inputs[1])

    mix_tr = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(alpha.outputs[0], mix_tr.inputs["Fac"])
    nt.links.new(transparent.outputs["BSDF"], mix_tr.inputs[1])
    nt.links.new(mix_surf.outputs["Shader"], mix_tr.inputs[2])
    nt.links.new(mix_tr.outputs["Shader"], out.inputs["Surface"])

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.rotation_mode = "QUATERNION"
    _organic_subsurf(obj)
    return obj, morph, lift, mat


def make_solid_tooth(name: str):
    """Enamel crown with no logo crossfade — used for the pass-by streak."""
    mat = bpy.data.materials.new(name=f"Mat_{name}")
    if hasattr(mat, "use_nodes"):
        mat.use_nodes = True
    make_solid(mat)
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf, _edge = _enamel_bsdf(nt)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    mesh, _ = build_crown_mesh(f"Mesh_{name}")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.rotation_mode = "QUATERNION"
    _organic_subsurf(obj)
    return obj, mat


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


VISIBILITY_PATHS = {"hide_viewport", "hide_render"}


def soften(action):
    """Continuous velocity through every key — no linear corners, no overshoot."""
    for fcurve in iter_fcurves(action):
        if fcurve.data_path in VISIBILITY_PATHS:
            continue
        for kp in fcurve.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.handle_left_type = "AUTO_CLAMPED"
            kp.handle_right_type = "AUTO_CLAMPED"
        fcurve.update()


def soften_object(obj):
    if obj.animation_data:
        soften(obj.animation_data.action)


def linearize(action):
    """For curves sampled every frame — play back the computed motion exactly.

    Sparse bezier keys were the other half of the roughness: AUTO_CLAMPED flattens
    its handles at every local extreme, so each control point became a small stall.
    """
    for fcurve in iter_fcurves(action):
        if fcurve.data_path in VISIBILITY_PATHS:
            continue
        for kp in fcurve.keyframe_points:
            kp.interpolation = "LINEAR"
        fcurve.update()


def linearize_object(obj):
    if obj.animation_data:
        linearize(obj.animation_data.action)


def smootherstep(t: float) -> float:
    """C2-continuous ease — no acceleration jump at either end."""
    t = min(max(t, 0.0), 1.0)
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def ramp(t: float, lo: float, hi: float) -> float:
    if hi - lo < 1e-6:
        return 1.0 if t >= hi else 0.0
    return smootherstep((t - lo) / (hi - lo))


def catmull_rom(points, t: float) -> Vector:
    """Uniform Catmull-Rom through every control point, t spanning the whole chain."""
    segments = len(points) - 1
    if segments < 1:
        return points[0].copy()
    x = min(max(t, 0.0), 1.0) * segments
    i = min(int(x), segments - 1)
    u = x - i
    p0 = points[max(i - 1, 0)]
    p1 = points[i]
    p2 = points[i + 1]
    p3 = points[min(i + 2, segments)]
    u2 = u * u
    u3 = u2 * u
    return (
        p1 * 2.0
        + (p2 - p0) * u
        + (p0 * 2.0 - p1 * 5.0 + p2 * 4.0 - p3) * u2
        + (p1 * 3.0 - p0 - p2 * 3.0 + p3) * u3
    ) * 0.5


def frange(start: float, stop: float, step: float):
    steps = int(round((stop - start) / step))
    return [start + i * step for i in range(steps + 1)]


def hold_off_camera(loc: Vector, cam_pos: Vector, min_dist: float) -> Vector:
    """Keep a crown from crowding the lens, easing the limit in rather than clamping.

    A tooth two units from a 34mm lens covers three screen widths and stops reading
    as a tooth at all. Distances beyond 2*min_dist are untouched, and the two
    branches meet with matching slope so the path stays smooth through the limit.
    """
    delta = loc - cam_pos
    dist = delta.length
    limit = 2.0 * min_dist
    if dist >= limit or dist < 1e-6:
        return loc
    eased = min_dist * (1.0 + (dist / limit) ** 2)
    return cam_pos + delta * (eased / dist)


def key_pose(obj, frame, loc: Vector, quat: Quaternion, scale: Vector, state: dict):
    """Keyframe a pose, keeping quaternions on the short arc so they slerp cleanly."""
    q = quat.normalized()
    previous = state.get("q")
    if previous is not None and previous.dot(q) < 0.0:
        q.negate()
    state["q"] = q.copy()
    obj.location = loc
    obj.rotation_quaternion = q
    obj.scale = scale
    obj.keyframe_insert("location", frame=frame)
    obj.keyframe_insert("rotation_quaternion", frame=frame)
    obj.keyframe_insert("scale", frame=frame)


def retime(scene, factor: int):
    """Stretch every key so the same choreography plays at a higher frame rate."""
    if factor == 1:
        return
    for action in bpy.data.actions:
        for fcurve in iter_fcurves(action):
            for kp in fcurve.keyframe_points:
                kp.co.x *= factor
                kp.handle_left.x *= factor
                kp.handle_right.x *= factor
            fcurve.update()
    scene.frame_end = int(scene.frame_end * factor)


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
scene.render.fps = BEAT_FPS
scene.frame_start = 1
scene.frame_end = FRAME_END

# Motion blur keeps the fast tumbles reading as movement instead of strobing.
if hasattr(scene.render, "use_motion_blur"):
    scene.render.use_motion_blur = True
    if hasattr(scene.render, "motion_blur_shutter"):
        scene.render.motion_blur_shutter = 0.28
if hasattr(scene, "eevee"):
    if hasattr(scene.eevee, "use_motion_blur"):
        scene.eevee.use_motion_blur = True
    if hasattr(scene.eevee, "motion_blur_shutter"):
        scene.eevee.motion_blur_shutter = 0.28
    if hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 40
    for flag in ("use_ssr", "use_raytracing", "use_gtao"):
        if hasattr(scene.eevee, flag):
            setattr(scene.eevee, flag, True)

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


BRAND_BLUE = (
    srgb_to_linear(0x4A / 255),
    srgb_to_linear(0x90 / 255),
    srgb_to_linear(0xE2 / 255),
    1.0,
)
bg.inputs[0].default_value = BRAND_BLUE
bg.inputs[1].default_value = 1.0

# Camera rays keep the flat brand blue exactly as before; every other ray sees a
# soft dark-to-bright gradient. A mirror-flat surround gives glossy enamel nothing
# to reflect, which is half of why the crowns looked like paper cut-outs.
world_out = next((n for n in nt_world.nodes if n.type == "OUTPUT_WORLD"), None)
env_coord = nt_world.nodes.new("ShaderNodeTexCoord")
env_split = nt_world.nodes.new("ShaderNodeSeparateXYZ")
nt_world.links.new(env_coord.outputs["Generated"], env_split.inputs["Vector"])
env_range = nt_world.nodes.new("ShaderNodeMapRange")
env_range.inputs["From Min"].default_value = -0.65
env_range.inputs["From Max"].default_value = 0.85
env_range.clamp = True
nt_world.links.new(env_split.outputs["Z"], env_range.inputs["Value"])

env_ramp = nt_world.nodes.new("ShaderNodeValToRGB")
env_ramp.color_ramp.elements[0].position = 0.0
env_ramp.color_ramp.elements[0].color = (0.012, 0.035, 0.085, 1.0)
env_ramp.color_ramp.elements[1].position = 1.0
env_ramp.color_ramp.elements[1].color = (1.30, 1.34, 1.42, 1.0)
mid = env_ramp.color_ramp.elements.new(0.52)
mid.color = (0.16, 0.30, 0.55, 1.0)
horizon = env_ramp.color_ramp.elements.new(0.70)
horizon.color = (0.62, 0.74, 0.95, 1.0)
nt_world.links.new(env_range.outputs["Result"], env_ramp.inputs["Fac"])

env_bg = nt_world.nodes.new("ShaderNodeBackground")
env_bg.inputs[1].default_value = ENV_STRENGTH
nt_world.links.new(env_ramp.outputs["Color"], env_bg.inputs[0])

world_path = nt_world.nodes.new("ShaderNodeLightPath")
world_mix = nt_world.nodes.new("ShaderNodeMixShader")
nt_world.links.new(world_path.outputs["Is Camera Ray"], world_mix.inputs["Fac"])
nt_world.links.new(env_bg.outputs[0], world_mix.inputs[1])
nt_world.links.new(bg.outputs[0], world_mix.inputs[2])
if world_out:
    nt_world.links.new(world_mix.outputs[0], world_out.inputs[0])
if hasattr(scene, "view_settings"):
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

aim = bpy.data.objects.new("CamAim", None)
scene.collection.objects.link(aim)
aim.empty_display_size = 0.35

for p in TOOTH_2D_PATHS:
    if not p.exists():
        raise FileNotFoundError(p)
if not SHELL_PATH.exists():
    raise FileNotFoundError(SHELL_PATH)

# --- teeth (solid enamel crowns that seat as 2D logo teeth) ---
teeth = []
morphs = []
lifts = []
count = len(ARCH_UV)
cam_start = Vector((0.25, -10.0, 7.0))
half_x, half_z, shell_aspect = shell_half_extents(SHELL_PATH)

for i in range(count):
    path_2d = TOOTH_2D_PATHS[i % len(TOOTH_2D_PATHS)]
    obj, morph, lift, _ = make_morph_tooth(f"Tooth_{i:02d}", path_2d)
    obj.location = curve_point(i, count)
    obj.rotation_quaternion = aim_quat(obj.location, cam_start, track="Z", up="Y")
    teeth.append(obj)
    morphs.append(morph)
    lifts.append(lift)

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
DEPTH_FLIGHT = 58
FLYIN_GATE = DEPTH_START + 6
FLYIN_STAGGER = 8
FLYIN_FLIGHT = 74

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

soften_object(cam)
soften(aim.animation_data.action if aim.animation_data else None)
soften(cam_data.animation_data.action if cam_data.animation_data else None)

# --- tooth motion ---
logo_width = half_x * 2
base_tooth_w = logo_width * 0.034

for i, obj in enumerate(teeth):
    morph = morphs[i]
    lift = lifts[i]
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
    # Control points for one continuous arc: up out of frame bottom, out to the
    # tumble, then curving in to the seat. Catmull-Rom keeps curvature continuous
    # across all of them, so there is no corner to read as a hitch.
    p_start = Vector((seat.x * 0.34, cam_l.y + 3.0, cam_l.z - 8.6))
    p_rise = Vector((seat.x * 0.55 + side * 0.55, cam_l.y + 5.2, cam_l.z - 2.4))
    p_tumble = Vector((seat.x * 0.78 + side * 1.30, -3.2, seat.z * 0.25 + side * 0.80))
    p_mid = Vector((seat.x * 0.93, -0.9, seat.z * 0.55))
    path = [p_start, p_rise, p_tumble, p_mid, seat.copy()]

    for f, hidden in ((1, True), (start_f - 1, True), (start_f, False)):
        obj.hide_viewport = hidden
        obj.hide_render = hidden
        obj.keyframe_insert("hide_viewport", frame=f)
        obj.keyframe_insert("hide_render", frame=f)

    seated_q = Euler((math.radians(90), 0.0, 0.0), "XYZ").to_quaternion()
    seated_scale = Vector((scale, scale, scale * SEAT_FLATTEN))

    q_start = (aim_quat(p_start, p_rise) @ spin("X", 25.0 * side)).normalized()
    q_seat_arc = seated_q.copy()
    if q_start.dot(q_seat_arc) < 0.0:
        q_seat_arc.negate()

    # Whole turns only, so the roll unwinds to exactly the seated pose.
    turns = TOOTH_TURNS[i % len(TOOTH_TURNS)]
    pose = {}

    for f in frange(start_f, land_f, SAMPLE_STEP):
        t = (f - start_f) / max(land_f - start_f, 1)
        # Extra ease into the seat so the last stretch is a settle, not a hit.
        travel = 1.0 - (1.0 - smootherstep(t)) ** 1.45
        loc = hold_off_camera(catmull_rom(path, travel), cam_loc_at(f), MIN_CAM_DIST)

        # Finish the tumble well before the lockup so the last beat is only translation.
        spin_t = smootherstep(min(t / 0.66, 1.0))
        align_t = smootherstep(min(t / 0.88, 1.0))
        quat = q_start.slerp(q_seat_arc, align_t)
        quat = quat @ Quaternion(AXES["Y"], turns * 2.0 * math.pi * spin_t)
        wobble = (1.0 - ramp(t, 0.58, 0.90)) * math.sin(math.pi * t)
        quat = quat @ Quaternion(AXES["X"], math.radians(18.0) * side * wobble)

        # Depth collapse and the 2D crossfade share one curve, so the crown never
        # squashes while it is still shaded as a solid.
        m = ramp(t, MORPH_START, 1.0)
        s = scale * _profile(t, FLIGHT_SCALE)
        depth = 1.0 - (1.0 - SEAT_FLATTEN) * m

        key_pose(obj, f, loc, quat, Vector((s, s, s * depth)), pose)
        key_morph(morph, f, m)
        # Runs ahead of the crossfade so the crown is already at logo white by the
        # time the flat tooth takes over.
        key_morph(lift, f, ramp(t, SEAT_LIFT_START, 1.0))

    key_pose(obj, land_f, seat, seated_q, seated_scale, pose)
    key_pose(obj, FRAME_END, seat, seated_q, seated_scale, pose)
    key_morph(morph, land_f, 1.0)
    key_morph(morph, FRAME_END, 1.0)
    key_morph(lift, land_f, 1.0)
    key_morph(lift, FRAME_END, 1.0)

    linearize_object(obj)
    if morph.id_data.animation_data:
        linearize(morph.id_data.animation_data.action)

# Pass-by streak — a full 3D crown tumbling past the lens
obj, pass_mat = make_solid_tooth("PassBy_00")

appear = FLYIN_GATE + 4
pass_out_f = appear + 42
cam_l = cam_loc_at(appear)
for f, hidden in ((1, True), (appear - 1, True), (appear, False), (pass_out_f, False), (pass_out_f + 2, True)):
    obj.hide_viewport = hidden
    obj.hide_render = hidden
    obj.keyframe_insert("hide_viewport", frame=f)
    obj.keyframe_insert("hide_render", frame=f)

pass_pose = {}
pass_path = [
    Vector((2.2, cam_l.y + 2.0, cam_l.z - 7.0)),
    Vector((0.6, cam_l.y + 3.4, cam_l.z - 4.0)),
    Vector((-0.5, cam_l.y + 5.0, cam_l.z - 1.5)),
    Vector((-1.6, 3.0, 1.0)),
    Vector((-2.5, 8.0, 3.0)),
]
pass_look = Vector((0.0, cam_l.y + 6.0, cam_l.z))
for f in frange(appear, pass_out_f, SAMPLE_STEP):
    t = (f - appear) / max(pass_out_f - appear, 1)
    loc = hold_off_camera(catmull_rom(pass_path, smootherstep(t)), cam_loc_at(f), MIN_CAM_DIST)
    quat = aim_quat(loc, pass_look) @ Quaternion(AXES["Y"], math.radians(-135.0) * t)
    ps = 2.0 + 0.55 * math.sin(math.pi * min(t * 1.6, 1.0)) - 2.25 * smootherstep(max(t - 0.45, 0.0) / 0.55)
    ps = max(ps, 0.12)
    key_pose(obj, f, loc, quat, Vector((ps, ps, ps)), pass_pose)
linearize_object(obj)

for obj in teeth:
    assert obj.animation_data and obj.animation_data.action, f"{obj.name} has no action"

scene.frame_set(1)

# --- light rig, riding the camera ---
# The logo shell is a pure emission plane, so none of this touches the lockup: these
# lights only sculpt the flying crowns. Parenting to the camera keeps the key and the
# rims in the same relative position through every bank, so the highlights slide
# across the enamel instead of popping as the camera swings.
# Suns, not lamps. Crowns pass anywhere from 2 to 15 units from the lens, and a
# positioned lamp covering the far end leaves the close fly-bys unlit from behind —
# which is what turned them grey. Sun irradiance does not fall off, so one rig holds
# up across the whole depth range.
def add_sun(name, energy, angle_deg, local_dir, color=(1.0, 1.0, 1.0)):
    data = bpy.data.lights.new(name, type="SUN")
    data.energy = energy * LIGHT_GAIN
    data.angle = math.radians(angle_deg)
    data.color = color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.parent = cam
    obj.rotation_euler = local_dir.normalized().to_track_quat("-Z", "Y").to_euler()
    return obj


# Camera space: -Z is forward, +Y up, +X right. Vectors below are travel directions.
add_sun("KeyLight", 1.30, 14.0, Vector((-0.45, -0.55, -1.0)))
add_sun("FillLight", 0.45, 30.0, Vector((0.55, 0.30, -1.0)), color=(0.70, 0.83, 1.0))
# Kickers travel back toward the lens, so they catch the far edge of every crown.
# Run them hot: they only reach the silhouette, and that bright rim is what
# separates white enamel from a flat blue field.
add_sun("RimLight", 2.40, 7.0, Vector((0.22, -0.34, 1.0)), color=(0.95, 0.98, 1.0))
add_sun("RimLightB", 1.30, 9.0, Vector((-0.34, 0.42, 1.0)), color=(0.88, 0.94, 1.0))

# One travelling area lamp near the lens: gives the close fly-bys a soft box
# reflection that slides as they roll, which suns alone cannot do.
glint_data = bpy.data.lights.new("SpecSweep", type="AREA")
glint_data.energy = 240.0 * LIGHT_GAIN
glint_data.size = 4.0
glint = bpy.data.objects.new("SpecSweep", glint_data)
scene.collection.objects.link(glint)
glint.parent = cam
for f, gx in ((1, -5.0), (FRAME_END // 2, 1.0), (FRAME_END, 5.0)):
    glint.location = Vector((gx, 2.2, -2.6))
    glint.rotation_euler = (Vector((0.0, 0.0, -9.0)) - glint.location).to_track_quat("-Z", "Y").to_euler()
    glint.keyframe_insert("location", frame=f)
    glint.keyframe_insert("rotation_euler", frame=f)
soften_object(glint)

# Same choreography, twice the frames: no strobing on the fast tumbles.
retime(scene, RENDER_FPS // BEAT_FPS)
scene.render.fps = RENDER_FPS

scene.render.filepath = str(ROOT / "blender/renders/splash_")
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
(ROOT / "blender/renders").mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
print(f"Saved {OUT_BLEND}")
print(f"Beats 1–{FRAME_END} @{BEAT_FPS}fps → frames 1–{scene.frame_end} @{RENDER_FPS}fps")
print(f"Logo in @{LOGO_IN_START}–{LOGO_IN_END}; fly-ins from @{FLYIN_GATE}; last land @{last_land}")
print(f"Rest seat0 {seat_world(0, rig_rest, rig_rest_s, half_x, half_z)[0][:]}")
