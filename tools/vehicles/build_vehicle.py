"""Build a web-ready vehicle GLB for the Tint Studio from a source .blend.

    python -m venv .bpy && .bpy/bin/pip install "bpy==4.2.*"      # Blender as a Python module
    .bpy/bin/python tools/vehicles/build_vehicle.py <recipe> <source.blend> <out.glb> [--render preview.png]
    node .claude/skills/web-3d-models/scripts/optimize_model.mjs out.glb assets/vehicles/<id>/<id>.glb --texture-size 1024

Recipes live in tools/vehicles/recipes.py. What the build does:
  1. drops cameras/lights/props, applies modifiers, scales to real-world meters
  2. welds split vertices (SketchUp/FBX exports) and applies angle-based smooth shading
  3. replaces every material with a PBR material by role (paint, chrome, glass, rubber…)
  4. splits the glass into one mesh per window, named for the configurator:
       Glass_Windshield, Glass_FrontDriver, Glass_FrontPassenger, Glass_RearDriver,
       Glass_RearPassenger, Glass_RearWindow, Glass_Roof, Glass_Lamp, Glass_Other
     (driver side = US left = +X; the car faces -Y in Blender = +Z in glTF)
  5. optional per-role decimation, generated interior, license plates
  6. exports GLB (+Y up)
"""
import sys, os, math, importlib.util
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('recipes', os.path.join(HERE, 'recipes.py'))
recipes = importlib.util.module_from_spec(spec); spec.loader.exec_module(recipes)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
recipe_name, src, out = argv[0], argv[1], argv[2]
render_path = argv[argv.index('--render') + 1] if '--render' in argv else None
NO_DECIMATE = '--no-decimate' in argv
R = recipes.RECIPES[recipe_name]
SRC_DIR = os.path.dirname(os.path.abspath(src))
log = lambda *a: print('[build]', *a, flush=True)

bpy.ops.wm.open_mainfile(filepath=src)
scene = bpy.context.scene

# ---------- 1. Clean the scene ----------
for ob in list(bpy.data.objects):
    keep = ob.type == 'MESH' and ob.name not in R.get('drop', []) and not any(ob.name.startswith(p) for p in R.get('drop_prefix', []))
    if ob.type == 'EMPTY':
        for c in ob.children:
            mw = c.matrix_world.copy(); c.parent = None; c.matrix_world = mw
    if not keep:
        bpy.data.objects.remove(ob, do_unlink=True)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    for m in o.modifiers:
        if m.type == 'SUBSURF' and 'subsurf_levels' in R:
            m.levels = m.render_levels = R['subsurf_levels']
    bpy.context.view_layer.objects.active = o
    for o2 in bpy.data.objects: o2.select_set(o2 == o)
    bpy.ops.object.convert(target='MESH')          # applies modifiers
    # a material shared with other parts can be given its own role on this object only
    for mname in R.get('split_materials', {}).get(o.name, []):
        for idx, m in enumerate(o.data.materials):   # mesh-level, so it survives the join
            if m and m.name == mname:
                o.data.materials[idx] = bpy.data.materials.new(f'{o.name}/{mname}')
    # objects without material slots get one from the recipe (e.g. an emblem)
    if not o.material_slots and o.name in R.get('object_materials', {}):
        o.data.materials.append(bpy.data.materials.new(R['object_materials'][o.name]))
        o.data.materials[0].name = R['object_materials'][o.name]

# join into one object so materials/geometry can be processed together
for o in bpy.data.objects: o.select_set(o.type == 'MESH')
bpy.context.view_layer.objects.active = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bpy.ops.object.join()
car = bpy.context.view_layer.objects.active
car.name = 'Car'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---------- scale to real size ----------
bb = [car.matrix_world @ Vector(c) for c in car.bound_box]
length = max(v.y for v in bb) - min(v.y for v in bb)
s = R['length_m'] / length
car.scale = (s, s, s)
bpy.ops.object.transform_apply(scale=True)
bb = [Vector(c) for c in car.bound_box]
mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
car.data.transform(Matrix.Translation(Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z))))
log('scaled by', round(s, 4), 'size', [round(v, 3) for v in (mx - mn)], 'tris~', sum(len(p.vertices) - 2 for p in car.data.polygons))

# ---------- 2. weld + clean ----------
bm = bmesh.new(); bm.from_mesh(car.data)
if R.get('weld', 0):
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=R['weld'])
    log('welded verts', before, '→', len(bm.verts))
    # SketchUp/FBX exports mix face windings; once vertices are shared, smooth shading would
    # average opposite normals into black patches. Make each connected surface face outward.
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_area() < 1e-10], context='FACES')
bm.to_mesh(car.data); bm.free()

# ---------- 3. materials by role ----------
def principled(name, p):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    def lin(c):  # recipes use sRGB hex-ish tuples; Blender wants linear
        return tuple(((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c)
    b.inputs['Base Color'].default_value = (*lin(p.get('color', (0.8, 0.8, 0.8))), 1)
    b.inputs['Metallic'].default_value = p.get('metal', 0.0)
    b.inputs['Roughness'].default_value = p.get('rough', 0.5)
    if p.get('coat'):
        b.inputs['Coat Weight'].default_value = p['coat']
        b.inputs['Coat Roughness'].default_value = p.get('coat_rough', 0.03)
    if p.get('emit'):
        b.inputs['Emission Color'].default_value = (*lin(p['emit']), 1)
        b.inputs['Emission Strength'].default_value = p.get('emit_strength', 1.0)
    if p.get('transmission'):
        b.inputs['Transmission Weight'].default_value = p['transmission']
        b.inputs['IOR'].default_value = 1.5
    if 'alpha' in p:
        b.inputs['Alpha'].default_value = p['alpha']
        m.blend_method = 'BLEND'
        m.surface_render_method = 'BLENDED'
    if p.get('texture'):
        tex = nt.nodes.new('ShaderNodeTexImage')
        t = p['texture']
        if t.startswith('gen:'):      # generated later (e.g. the license plate)
            tex.image = bpy.data.images.new(t[4:], 8, 8)
        else:                          # 'src:' = next to the source .blend
            tex.image = bpy.data.images.load(os.path.join(SRC_DIR, t[4:]) if t.startswith('src:') else t)
            tex.image.pack()
        nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
        if p.get('texture_emit'):
            nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
            b.inputs['Emission Strength'].default_value = p.get('emit_strength', 1.0)
    m.use_backface_culling = p.get('cull', False)
    return m

roles = {k: principled(k, v) for k, v in recipes.ROLES.items()}
for k, v in R.get('roles', {}).items():            # recipe-specific roles / overrides
    roles[k] = principled(k, {**recipes.ROLES.get(k, {}), **v})
unmapped = set()
for i, slot in enumerate(car.material_slots):
    name = slot.material.name if slot.material else '-'
    role = R['materials'].get(name)
    if role is None:
        unmapped.add(name); role = 'trim_black'
    slot.material = roles[role]
if unmapped: log('WARNING unmapped materials → trim_black:', sorted(unmapped))

# region overrides: faces of one role inside a box (meters, centered car, front = -Y) get
# another role — for parts modeled into a shared mesh/material (e.g. a grille lattice in paint)
for reg in R.get('regions', []):
    names = [s.material.name for s in car.material_slots]
    if reg['to'] not in names:
        car.data.materials.append(roles[reg['to']]); names.append(reg['to'])
    src_i, dst_i = names.index(reg['from']), names.index(reg['to'])
    (x0, x1), (y0, y1), (z0, z1) = reg['x'], reg['y'], reg['z']
    n = 0
    for p in car.data.polygons:
        c = p.center
        if p.material_index == src_i and x0 <= c.x <= x1 and y0 <= c.y <= y1 and z0 <= c.z <= z1 and (reg.get('facing') is None or p.normal.y < -reg['facing']):
            p.material_index = dst_i; n += 1
    log('region', reg['from'], '→', reg['to'], n, 'faces')

# ---------- split by material into role objects ----------
for o in bpy.data.objects: o.select_set(o == car)
bpy.context.view_layer.objects.active = car
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.data.objects if o.type == 'MESH']
for o in parts:
    o.name = o.material_slots[0].material.name if o.material_slots else 'Part'
    # drop unused slots so each object has exactly its role material
    used = {p.material_index for p in o.data.polygons}
    for i in reversed(range(len(o.material_slots))):
        if i not in used:
            o.active_material_index = i
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.material_slot_remove()

# ---------- decimate / smooth ----------
for o in [p for p in bpy.data.objects if p.type == 'MESH']:
    role = o.material_slots[0].material.name if o.material_slots else ''
    ratio = None if NO_DECIMATE else R.get('decimate', {}).get(role)
    for x in bpy.data.objects: x.select_set(x == o)
    bpy.context.view_layer.objects.active = o
    if ratio:
        planar = o.modifiers.new('planar', 'DECIMATE'); planar.decimate_type = 'DISSOLVE'; planar.angle_limit = math.radians(0.5)
        bpy.ops.object.modifier_apply(modifier='planar')
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        target = R.get('decimate_target', {}).get(role)
        if ratio < 1:
            d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = ratio; d.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier='dec')
        log('decimated', role, tris, '→', sum(len(p.vertices) - 2 for p in o.data.polygons))
    fairing = R.get('fair', {}).get(role)
    if fairing:
        # Even out dents/lumps in low-quality body panels without changing the silhouette.
        f = o.modifiers.new('fair', 'LAPLACIANSMOOTH')
        f.lambda_factor, f.iterations = fairing
        f.use_volume_preserve = True
        f.use_normalized = True
        bpy.ops.object.modifier_apply(modifier='fair')
    if role.startswith('glass'):
        bpy.ops.object.shade_smooth()
    else:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(R.get('smooth_angle', 35)))

# ---------- 4. glass → windows ----------
glass_obj = bpy.data.objects.get('glass')
zone_report = []
if glass_obj:
    for x in bpy.data.objects: x.select_set(x == glass_obj)
    bpy.context.view_layer.objects.active = glass_obj
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    pieces = [o for o in bpy.data.objects if o.type == 'MESH' and o.material_slots and o.material_slots[0].material.name == 'glass']
    size = mx - mn  # (pre-centering size, same extents)
    W, L, H = size.x, size.y, size.z
    info = []
    for p in pieces:
        me = p.data; area = 0; c = Vector(); n = Vector()
        for f in me.polygons:
            area += f.area; c += f.center * f.area; n += Vector(map(abs, f.normal)) * f.area
        if area == 0: continue
        c /= area; n /= area
        xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
        info.append(dict(obj=p, area=area, c=c, n=n, xr=(min(xs), max(xs)), yr=(min(ys), max(ys)), zr=(min(zs), max(zs))))
    belt = R.get('beltline_z', 0.52) * H          # glass below this is a lamp cover, not a window
    zone = {}
    sides = {'Driver': [], 'Passenger': []}
    for i in info:
        o, c, n = i['obj'], i['c'], i['n']
        width = i['xr'][1] - i['xr'][0]
        if c.z < belt:                                  # headlight / taillight covers
            zone[o] = 'Lamp'; continue
        if i['area'] < R.get('min_glass_area', 0.004):
            zone[o] = 'Other'; continue
        if width < 0.35 * W and abs(c.x) > 0.2 * W and n.x > 0.55:   # faces sideways → side window
            sides['Driver' if c.x > 0 else 'Passenger'].append(i); continue
        if width > 0.4 * W and n.x < 0.5:
            if R.get('roof_glass') and n.z > 0.8 and c.z > 0.82 * H and abs(c.y) < 0.3 * L:
                zone[o] = 'Roof'
            else:
                zone[o] = 'Windshield' if c.y < 0 else 'RearWindow'
            continue
        zone[o] = 'Other'
    for side, lst in sides.items():
        if not lst: continue
        lst.sort(key=lambda i: i['c'].y)               # front (-Y) first
        first = lst[0]
        for i in lst:
            # everything overlapping the front-most window's span is the front door glass
            front = i['c'].y <= first['yr'][1] + 0.02
            zone[i['obj']] = ('Front' if front else 'Rear') + side
    # join pieces per zone and name them
    by = {}
    for o, zname in zone.items(): by.setdefault(zname, []).append(o)
    for zname, objs in by.items():
        for x in bpy.data.objects: x.select_set(x in objs)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1: bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        o.name = f'Glass_{zname}'; o.data.name = o.name
        if zname in ('Lamp', 'Other'):
            o.material_slots[0].material = roles['lamp_glass']
        zone_report.append((o.name, len(objs), sum(len(p.vertices) - 2 for p in o.data.polygons)))
    log('glass zones:', zone_report)

# ---------- 5. generated interior / plates ----------
if R.get('interior'):
    recipes.build_interior(bpy, bmesh, Vector, Matrix, roles, R['interior'], log)
for spec_ in R.get('plates', []):
    recipes.build_plate(bpy, bmesh, Vector, roles, spec_, log)

# ---------- summary ----------
tot = 0
for o in sorted([o for o in bpy.data.objects if o.type == 'MESH'], key=lambda o: o.name):
    t = sum(len(p.vertices) - 2 for p in o.data.polygons); tot += t
    log(f'  {o.name:24} tris={t}')
log('TOTAL tris', tot)

# ---------- optional check render (zones colored) ----------
if render_path:
    recipes.check_render(bpy, Vector, render_path)

# ---------- 6. export ----------
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True,
                          export_cameras=False, export_lights=False, export_extras=False,
                          export_image_format='AUTO', use_selection=False)
log('exported', out)
