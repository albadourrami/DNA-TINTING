"""Per-vehicle build recipes for tools/vehicles/build_vehicle.py.

A recipe says how to turn one source model into a Tint Studio GLB: which source objects to
drop, the real-world length to scale to, which source material plays which role, how hard to
decimate each role, and optional generated interior / license plates.

Colors are sRGB 0..1 (like a color picker); the build converts them to linear.
"""
import math, os

# ---------------------------------------------------------------------------
# Shared PBR looks. Tuned for the studio lighting in js/tint-studio/viewer.js.
# ---------------------------------------------------------------------------
ROLES = {
    'paint':             dict(color=(0.78, 0.79, 0.81), metal=0.85, rough=0.32, coat=1.0, coat_rough=0.03),
    'paint_white':       dict(color=(0.93, 0.93, 0.92), metal=0.1, rough=0.3, coat=1.0, coat_rough=0.03),
    'trim_black':        dict(color=(0.035, 0.035, 0.04), rough=0.55),
    'trim_gloss_black':  dict(color=(0.02, 0.02, 0.022), rough=0.3, coat=0.3),
    'chrome':            dict(color=(0.97, 0.97, 0.98), metal=1.0, rough=0.06),
    'black_chrome':      dict(color=(0.22, 0.22, 0.24), metal=1.0, rough=0.12),
    'alloy':             dict(color=(0.80, 0.81, 0.83), metal=1.0, rough=0.24),
    'alloy_dark':        dict(color=(0.30, 0.31, 0.33), metal=1.0, rough=0.28),
    'rubber':            dict(color=(0.04, 0.04, 0.04), rough=0.88),
    'undercarriage':     dict(color=(0.025, 0.025, 0.025), rough=0.92),
    'interior_leather':  dict(color=(0.60, 0.50, 0.40), rough=0.55),   # light "macchiato" leather: tint reads clearly against it
    'interior_dark':     dict(color=(0.06, 0.06, 0.065), rough=0.5),
    'interior_trim':     dict(color=(0.02, 0.02, 0.022), rough=0.2, coat=0.4),
    'headliner':         dict(color=(0.30, 0.29, 0.28), rough=0.92),
    'lamp_glass':        dict(color=(0.96, 0.96, 0.96), rough=0.03, alpha=0.18),
    'lamp_inner':        dict(color=(0.86, 0.87, 0.9), metal=1.0, rough=0.18, emit=(1, 1, 1), emit_strength=0.25),
    'tail_red':          dict(color=(0.55, 0.03, 0.03), rough=0.1, coat=0.8, emit=(0.9, 0.04, 0.04), emit_strength=0.5),
    'drl':               dict(color=(1, 1, 1), rough=0.2, emit=(0.92, 0.96, 1), emit_strength=3.0),
    'indicator':         dict(color=(1, 0.55, 0.1), rough=0.2, emit=(1, 0.45, 0.05), emit_strength=1.2),
    'plate':             dict(color=(1, 1, 1), rough=0.45, texture='gen:plate.png'),
    'glass':             dict(color=(0.86, 0.92, 0.9), rough=0.02, transmission=1.0),  # replaced at runtime by the tint shader
}

RECIPES = {
    # ---------------- Audi A3 Sportback (sedan slot) ----------------
    'a3': dict(
        length_m=4.32,
        subsurf_levels=2,
        drop=['Plane.000', 'Plane.001', 'Plane.002', 'Plane.003', 'Plane.004', 'Plane.005', 'Plane.006',
              'Plane.007', 'Plane.008', 'Plane.009', 'Plane.010', 'Plane.011'],
        object_materials={'AUDIARMA.001': 'EmblemFront'},
        split_materials={'ARRAY': ['Material.006']},      # grille bars share the paint material
        materials={
            'Glass.002': 'glass', 'Material.006': 'paint_white', 'Material.003': 'trim_gloss_black',
            'BACKHEADLIGHTS': 'tail_tex', 'emitters': 'drl', 'Black.001': 'trim_black', 'Material.018': 'indicator',
            'Rubber': 'trim_black', 'tyyre': 'tire_tex', 'Steel': 'alloy', 'Material.001': 'chrome',
            'EmblemFront': 'chrome', 'Material.011': 'plate', 'ARRAY/Material.006': 'trim_gloss_black',
        },
        roles={
            'tail_tex': dict(color=(1, 1, 1), rough=0.15, texture='src:Back Headlight.jpg', texture_emit=True, emit_strength=0.6),
            'tire_tex': dict(color=(1, 1, 1), rough=0.85, texture='src:Tire.tga'),
        },
        beltline_z=0.6,
        smooth_angle=40,
        # the single-frame grille lattice is modeled into the body with the paint material
        regions=[dict(**{'from': 'paint_white', 'to': 'trim_gloss_black'}, x=(-0.38, 0.38), y=(-2.25, -1.95), z=(0.4, 0.7), facing=0.6)],

        interior=dict(seat='interior_leather', dark='interior_dark', trim='interior_trim', headliner='headliner'),
        plates=[dict(role='plate')],
    ),
    # ---------------- Mercedes-Benz GLS 580 (SUV slot) ----------------
    'gls': dict(
        length_m=5.21,
        drop=['Cylinder', 'Cylinder.001'],
        weld=0.0006,
        materials={
            'Polar_White': 'paint_white', 'Color_M08': 'trim_black', 'Interior': 'interior_leather',
            'Color_A08': 'tail_red', 'Color_A07': 'tail_red', 'Color_M02': 'chrome', 'Color_M03': 'alloy',
            'UnderCarriage': 'undercarriage', 'ChromeBlack_Windows': 'black_chrome',
            '_2020_Mercedes_Benz_GLS450_wire_088144225': 'interior_trim', 'Tyres': 'rubber',
            'WindowsTint': 'glass', 'Lights_Glass': 'lamp_glass', 'Color_M01': 'lamp_inner',
            'Grille': 'trim_gloss_black', 'Color_M04': 'lamp_inner', 'material': 'plate',
        },
        decimate={'paint_white': 0.6, 'trim_black': 0.55, 'interior_leather': 0.5, 'tail_red': 0.3,
                  'chrome': 0.6, 'alloy': 0.6, 'undercarriage': 0.35, 'interior_trim': 0.6, 'trim_gloss_black': 0.7,
                  'lamp_inner': 0.5, 'black_chrome': 0.8, 'rubber': 0.8},
        beltline_z=0.5,
        roof_glass=True,   # panoramic roof: stays factory glass
        smooth_angle=35,
        plates=[dict(role='plate')],
    ),
}


# ---------------------------------------------------------------------------
# License plate texture (DNA Tinting) sized to the plate mesh
# ---------------------------------------------------------------------------
def plate_image(path, aspect):
    from PIL import Image, ImageDraw, ImageFont
    h = 256
    w = max(256, int(h * aspect))
    im = Image.new('RGB', (w, h), (238, 241, 245))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((8, 8, w - 9, h - 9), radius=20, outline=(30, 41, 59), width=10)
    def font(size):
        for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'):
            if os.path.exists(f): return ImageFont.truetype(f, size)
        return ImageFont.load_default()
    main = 'DNA TINTING' if aspect > 3 else 'DNA TINT'
    size = int(h * 0.42)
    while size > 20:
        f = font(size)
        if d.textlength(main, font=f) < w * 0.86: break
        size -= 4
    tw = d.textlength(main, font=f)
    d.text(((w - tw) / 2, h * 0.16), main, font=f, fill=(11, 18, 32))
    f2 = font(int(h * 0.13))
    sub = 'IT RUNS IN OUR BLOOD'
    d.text(((w - d.textlength(sub, font=f2)) / 2, h * 0.7), sub, font=f2, fill=(37, 99, 235))
    im.save(path)


def build_plate(bpy, bmesh, Vector, roles, spec, log):
    """Re-UV the plate mesh with a planar projection and give it a DNA Tinting plate texture."""
    ob = bpy.data.objects.get(spec['role'])
    if not ob:
        log('no plate object'); return
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    # One projection per plate: split faces into front-facing (-Y) and rear-facing (+Y) groups.
    groups = {}
    for f in bm.faces:
        groups.setdefault('rear' if f.normal.y > 0 else 'front', []).append(f)
    aspects = []
    for side, faces in groups.items():
        vs = {v for f in faces for v in f.verts}
        xs = [v.co.x for v in vs]; zs = [v.co.z for v in vs]
        x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
        aspects.append((x1 - x0) / max(z1 - z0, 1e-6))
        for f in faces:
            for l in f.loops:
                u = (l.vert.co.x - x0) / max(x1 - x0, 1e-6)
                if side == 'rear': u = 1 - u       # read correctly from outside (viewer faces -Y at the rear)
                l[uv].uv = (u, (l.vert.co.z - z0) / max(z1 - z0, 1e-6))
    bm.to_mesh(me); bm.free()
    # Real plates are 2:1 (US) to ~4.7:1 (EU); anything else is a sliver face skewing the average.
    aspect = min(5.0, max(1.8, sorted(aspects)[len(aspects) // 2]))
    tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.plate.png')
    plate_image(tmp, aspect)
    mat = ob.material_slots[0].material
    tex = [n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE'][0]
    tex.image = bpy.data.images.load(tmp); tex.image.pack()
    log('plate aspect', round(aspect, 2))


# ---------------------------------------------------------------------------
# Generated cabin for models without an interior. Proportions come from the glass,
# so it fits any car: dashboard, steering wheel, console, seats, door cards, headliner.
# ---------------------------------------------------------------------------
def build_interior(bpy, bmesh, Vector, Matrix, roles, spec, log):
    get = lambda n: bpy.data.objects.get(n)
    def bounds(o):
        vs = [o.matrix_world @ v.co for v in o.data.vertices]
        return Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))), Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    ws, rw, fd = get('Glass_Windshield'), get('Glass_RearWindow'), get('Glass_FrontDriver')
    if not (ws and rw and fd):
        log('interior: missing glass zones, skipped'); return
    ws0, ws1 = bounds(ws); rw0, rw1 = bounds(rw); fd0, fd1 = bounds(fd)
    y0 = ws0.y + 0.05           # dash starts just behind the windshield base (front is -Y)
    y1 = rw1.y - 0.05           # rear window bottom
    L = y1 - y0
    belt = fd0.z                # side window bottom
    roof = max(ws1.z, rw1.z, fd1.z)
    hw = fd0.x - 0.05           # inner half width at the beltline
    floor = max(0.26, belt - 0.62)
    log(f'interior: cabin L={L:.2f} halfW={hw:.2f} floor={floor:.2f} belt={belt:.2f} roof={roof:.2f}')

    def box(name, role, center, size, bevel=0.03, rot=(0, 0, 0)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if bevel:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=3, affect='EDGES', profile=0.5)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        ob.location = center; ob.rotation_euler = rot
        me.materials.append(roles[spec[role]])
        for p in me.polygons: p.use_smooth = True
        return ob

    made = []
    # dashboard + instrument binnacle
    made.append(box('Int_Dash', 'dark', (0, y0 + 0.16 * L / 2 + 0.1, belt - 0.14), (2 * hw, 0.16 * L + 0.2, 0.32), 0.06))
    made.append(box('Int_Binnacle', 'trim', (0.37, y0 + 0.27, belt + 0.03), (0.34, 0.16, 0.09), 0.03))
    # steering wheel (torus) + column
    bpy.ops.mesh.primitive_torus_add(major_radius=0.18, minor_radius=0.022, major_segments=40, minor_segments=10,
                                     location=(0.37, y0 + 0.27 * L, belt - 0.04), rotation=(math.radians(65), 0, 0))
    wheel = bpy.context.active_object; wheel.name = 'Int_Wheel'; wheel.data.materials.append(roles[spec['trim']]); made.append(wheel)
    made.append(box('Int_Console', 'dark', (0, y0 + 0.36 * L, floor + 0.16 * (roof - floor)), (0.24, 0.4 * L, 0.32 * (roof - floor)), 0.04))
    # seats: sized from the floor-to-roof height so they fit low cars and tall SUVs alike
    Hc = roof - floor
    fy = y0 + 0.47 * L
    for sx in (-0.37, 0.37):
        made.append(box('Int_SeatBase', 'seat', (sx, fy - 0.12, floor + 0.2 * Hc), (0.5, 0.52, 0.14), 0.05))
        made.append(box('Int_SeatBack', 'seat', (sx, fy + 0.14, floor + 0.5 * Hc), (0.5, 0.13, 0.5 * Hc), 0.05, (math.radians(-14), 0, 0)))
        made.append(box('Int_Headrest', 'seat', (sx, fy + 0.2, floor + 0.83 * Hc), (0.26, 0.1, 0.15 * Hc), 0.04, (math.radians(-10), 0, 0)))
    ry = y0 + 0.79 * L
    made.append(box('Int_RearBase', 'seat', (0, ry - 0.1, floor + 0.21 * Hc), (2 * hw - 0.14, 0.48, 0.15), 0.05))
    made.append(box('Int_RearBack', 'seat', (0, ry + 0.15, floor + 0.49 * Hc), (2 * hw - 0.14, 0.13, 0.46 * Hc), 0.05, (math.radians(-18), 0, 0)))
    for sx in (-0.4, 0, 0.4):
        made.append(box('Int_RearHead', 'seat', (sx, ry + 0.22, floor + 0.79 * Hc), (0.24, 0.09, 0.13 * Hc), 0.035, (math.radians(-12), 0, 0)))
    # door cards, floor, headliner, parcel shelf: close the cabin so you never see through the body
    for sx in (-1, 1):
        made.append(box('Int_DoorCard', 'dark', (sx * (hw + 0.02), y0 + L / 2, (floor + belt) / 2 + 0.02), (0.03, L * 0.92, belt - floor + 0.06), 0.01))
    made.append(box('Int_Floor', 'dark', (0, y0 + L / 2, floor), (2 * hw, L, 0.03), 0))
    made.append(box('Int_Headliner', 'headliner', (0, (ws1.y + rw0.y) / 2, roof - 0.05), (2 * hw + 0.04, max(0.4, rw0.y - ws1.y + 0.2), 0.02), 0.01))
    made.append(box('Int_Shelf', 'dark', (0, ry + 0.25 + (y1 - ry - 0.25) / 2, belt - 0.02), (2 * hw, max(0.1, y1 - ry - 0.25), 0.02), 0))
    made.append(box('Int_Bulkhead', 'dark', (0, y0 - 0.02, (floor + belt) / 2), (2 * hw, 0.03, belt - floor), 0))

    # one object per material keeps draw calls low
    by = {}
    for o in made: by.setdefault(o.data.materials[0].name, []).append(o)
    for mat, objs in by.items():
        for x in bpy.data.objects: x.select_set(x in objs)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        o.name = f'Interior_{mat}'
    log('interior: built', len(made), 'parts')


# ---------------------------------------------------------------------------
# Check render: zones in solid colors, interior visible through glass
# ---------------------------------------------------------------------------
ZONE_COLORS = {
    'Glass_Windshield': (1, 0.2, 0.15), 'Glass_FrontDriver': (0.2, 0.8, 0.3), 'Glass_FrontPassenger': (0.1, 0.45, 1),
    'Glass_RearDriver': (1, 0.85, 0.1), 'Glass_RearPassenger': (0.75, 0.35, 0.95), 'Glass_RearWindow': (1, 0.55, 0.1),
    'Glass_Roof': (0.1, 0.9, 0.9), 'Glass_Lamp': (1, 1, 1), 'Glass_Other': (1, 0, 1),
}

def check_render(bpy, Vector, path):
    sc = bpy.context.scene
    saved = {}
    for o in bpy.data.objects:
        if o.name in ZONE_COLORS:
            saved[o.name] = o.material_slots[0].material
            m = bpy.data.materials.new('dbg_' + o.name)
            m.diffuse_color = (*ZONE_COLORS[o.name], 1)
            m.use_nodes = True
            b = m.node_tree.nodes['Principled BSDF']
            b.inputs['Base Color'].default_value = (*ZONE_COLORS[o.name], 1)
            b.inputs['Alpha'].default_value = 0.75
            m.blend_method = 'BLEND'
            o.material_slots[0].material = m
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    ctr = (mn + mx) / 2; r = (mx - mn).length / 2
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = 800, 450
    sc.render.resolution_percentage = 100
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.8, 0.85, 1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    for name, d in [('front34', Vector((0.8, -1, 0.45))), ('rear34', Vector((-0.8, 1, 0.45))), ('side', Vector((1, 0.05, 0.12)))]:
        d = d.normalized(); cam.location = ctr + d * r * 2.4
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = path.replace('.png', f'-{name}.png')
        bpy.ops.render.render(write_still=True)
    for n, m in saved.items(): bpy.data.objects[n].material_slots[0].material = m
    bpy.data.objects.remove(cam, do_unlink=True)
