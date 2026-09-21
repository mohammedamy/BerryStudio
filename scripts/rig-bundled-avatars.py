#!/usr/bin/env python3
"""Create self-contained, pose-capable GLB variants of BerryStudio's bundled avatars.

Run with Blender in background mode:
  blender --background --python scripts/rig-bundled-avatars.py -- --output avatars/rigged

The sources stay untouched.  Each generated file has the bone vocabulary used by
Cloth Lab (LeftArm, LeftForeArm, LeftUpLeg, …), normalized skin weights, and a
small Walk action so the app can use the same pose/animation path for every
bundled mannequin.
"""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ASSETS = ("man", "fatman", "woman2", "boy", "boy2", "girl", "girl2", "girl3")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="avatars/rigged")
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def world_bounds(meshes):
    points = [mesh.matrix_world @ vertex.co for mesh in meshes for vertex in mesh.data.vertices]
    if not points:
        raise RuntimeError("No mesh vertices were imported")
    return (
        Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points))),
        Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points))),
    )


def add_bone(edit_bones, name, head, tail, parent=None):
    bone = edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    bone.parent = parent
    return bone


def make_armature(bounds_min, bounds_max):
    """Build an A-pose skeleton aligned to the normalized bundled meshes.

    The assets share a Z-up, roughly two-unit-high coordinate system.  Their
    silhouettes differ, so horizontal bone lengths derive from each asset's
    bounds while vertical landmarks derive from its own height.
    """
    height = bounds_max.z - bounds_min.z
    center_x = (bounds_min.x + bounds_max.x) * 0.5
    center_y = (bounds_min.y + bounds_max.y) * 0.5
    half_width = (bounds_max.x - bounds_min.x) * 0.5
    z = lambda fraction: bounds_min.z + height * fraction
    p = lambda x, y, z_value: Vector((x, y, z_value))

    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    armature = bpy.context.object
    armature.name = "BerryStudioHumanoid"
    armature.data.name = "BerryStudioHumanoid"
    edit_bones = armature.data.edit_bones
    edit_bones.remove(edit_bones[0])

    hips = add_bone(edit_bones, "Hips", p(center_x, center_y, z(0.34)), p(center_x, center_y, z(0.47)))
    spine = add_bone(edit_bones, "Spine", hips.tail, p(center_x, center_y, z(0.60)), hips)
    chest = add_bone(edit_bones, "Chest", spine.tail, p(center_x, center_y, z(0.70)), spine)
    neck = add_bone(edit_bones, "Neck", chest.tail, p(center_x, center_y, z(0.78)), chest)
    add_bone(edit_bones, "Head", neck.tail, p(center_x, center_y, z(0.96)), neck)

    shoulder_x = half_width * 0.22
    elbow_x = half_width * 0.56
    wrist_x = half_width * 0.79
    hand_x = half_width * 0.92
    shoulder_z = z(0.69)
    elbow_z = z(0.58)
    wrist_z = z(0.48)
    for side, sign in (("Left", -1), ("Right", 1)):
        arm = add_bone(edit_bones, f"{side}Arm", chest.tail, p(center_x + sign * elbow_x, center_y, elbow_z), chest)
        forearm = add_bone(edit_bones, f"{side}ForeArm", arm.tail, p(center_x + sign * wrist_x, center_y, wrist_z), arm)
        add_bone(edit_bones, f"{side}Hand", forearm.tail, p(center_x + sign * hand_x, center_y, wrist_z - height * 0.025), forearm)

    hip_x = half_width * 0.16
    knee_z = z(0.17)
    ankle_z = z(0.035)
    foot_y = center_y - (bounds_max.y - bounds_min.y) * 0.12
    for side, sign in (("Left", -1), ("Right", 1)):
        upper = add_bone(edit_bones, f"{side}UpLeg", p(center_x + sign * hip_x, center_y, z(0.36)), p(center_x + sign * hip_x, center_y, knee_z), hips)
        lower = add_bone(edit_bones, f"{side}Leg", upper.tail, p(center_x + sign * hip_x, center_y, ankle_z), upper)
        foot = add_bone(edit_bones, f"{side}Foot", lower.tail, p(center_x + sign * hip_x, foot_y, z(0.01)), lower)
        add_bone(edit_bones, f"{side}ToeBase", foot.tail, p(center_x + sign * hip_x, foot_y * 1.4 - center_y * 0.4, z(0.01)), foot)

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def point_to_segment_distance(point, start, end):
    direction = end - start
    length_squared = direction.length_squared
    if length_squared < 1e-10:
        return (point - start).length
    fraction = max(0.0, min(1.0, (point - start).dot(direction) / length_squared))
    return (point - (start + direction * fraction)).length


def bind_mesh(mesh, armature):
    """Assign stable distance-based skin weights without relying on bone heat.

    Bone heat is sensitive to non-manifold scanned meshes.  These assets are
    single sculpt exports, so deterministic nearest-bone weights are both more
    dependable and easier to validate in CI.  Four nearby bones per vertex
    keeps rotations smooth at elbows, knees, and the waist.
    """
    # The source scans are smooth human silhouettes.  Marking the imported
    # triangles smooth lets glTF retain indexed vertices; without this,
    # Blender emits one copy per triangle corner and turns a 3 MB avatar into
    # a 20+ MB download.
    for polygon in mesh.data.polygons:
        polygon.use_smooth = True
    mesh.parent = armature
    modifier = mesh.modifiers.new(name="BerryStudio Armature", type="ARMATURE")
    modifier.object = armature
    groups = {bone.name: mesh.vertex_groups.new(name=bone.name) for bone in armature.data.bones}
    bone_segments = []
    for bone in armature.data.bones:
        start = armature.matrix_world @ bone.head_local
        end = armature.matrix_world @ bone.tail_local
        bone_segments.append((bone.name, start, end))

    for vertex in mesh.data.vertices:
        point = mesh.matrix_world @ vertex.co
        nearest = sorted(
            ((point_to_segment_distance(point, start, end), name) for name, start, end in bone_segments),
            key=lambda item: item[0],
        )[:4]
        inverse = [(1.0 / max(distance * distance, 0.0004), name) for distance, name in nearest]
        total = sum(weight for weight, _ in inverse)
        for weight, name in inverse:
            groups[name].add([vertex.index], weight / total, "REPLACE")


def add_walk_action(armature):
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    action = bpy.data.actions.new("Walk")
    armature.animation_data_create()
    armature.animation_data.action = action
    for frame, phase in ((1, 0.0), (15, 1.0), (30, 0.0)):
        for name, direction in (("LeftArm", 1), ("RightArm", -1), ("LeftUpLeg", -1), ("RightUpLeg", 1)):
            pose_bone = armature.pose.bones[name]
            pose_bone.rotation_mode = "XYZ"
            pose_bone.rotation_euler.y = direction * phase * math.radians(18)
            pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 30
    bpy.context.scene.frame_set(1)


def rig_asset(source, destination):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"{source.name}: no mesh was imported")
    bounds_min, bounds_max = world_bounds(meshes)
    armature = make_armature(bounds_min, bounds_max)
    for mesh in meshes:
        bind_mesh(mesh, armature)
    add_walk_action(armature)
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(destination),
        export_format="GLB",
        export_animations=True,
        export_nla_strips=False,
        export_all_influences=True,
        # Reuse matching accessors across primitives.  The source GLBs are
        # compact indexed meshes; preserving shared accessors keeps the
        # browser-download cost practical without requiring a Draco decoder
        # in either Three.js surface.
        export_shared_accessors=True,
        export_yup=True,
    )
    print(f"RIGGED {source.name} -> {destination}")


def main():
    args = parse_args()
    root = Path(__file__).resolve().parents[1]
    output = root / args.output
    for asset in ASSETS:
        rig_asset(root / "avatars" / f"{asset}.glb", output / f"{asset}.glb")


if __name__ == "__main__":
    main()
