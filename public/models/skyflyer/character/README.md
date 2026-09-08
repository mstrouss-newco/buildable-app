# Farm main character (FM9)

Kenney "Animated Characters Bundle", characterSmall body. CC0, see LICENSE-kenney.txt.
Source kit lives on Mike's machine at:
`Kenney Game Assets All-in-1 3.5.0/3D assets/Animated Characters Bundle`

The kit ships FBX. These .glb files were converted with the npm package `fbx2gltf`
(`require('fbx2gltf')(src, dst, ['--binary'])`). Nothing else was changed.

## Files

| file | what it is |
|---|---|
| character-kid.glb | the body and skeleton. Carries NO animation clips of its own. |
| anim-idle.glb | standing still |
| anim-walk.glb | walking |
| anim-run.glb | running (spare, the farm may not need it) |
| anim-pickup.glb | bending down and picking something off the ground (harvest / feed) |
| skin-farm-a.png | default farm outfit: blue dungarees, white tee, green boots |
| skin-farm-b.png | second farm outfit: red shirt, grey dungarees, brown boots |
| skin-farm-girl.png | girl version, made by pasting the top 470 rows of the kit's casualFemaleA skin onto skin-farm-a |

Everything that makes her a person (outfit, hair, face, skin tone) is the ONE skin png,
1024x1024, shared UV layout across every skin in the kit. Load it as a named slot, never a
hardcoded path, so a different outfit or a per-kid character is a one-file change later.

## Loading notes, all verified working in the real farm

1. Clips live in the anim-*.glb files, not in character-kid.glb. Load an anim file and play
   its clip on a mixer built on the character's scene. Bone names match, no retargeting.
2. **Do not take `animations[0]` from an anim file.** Index 0 is a T-pose called
   `Root|0.Targeting Pose`. Take the clip whose name is not "Targeting", i.e.
   `Root|Idle`, `Root|Walk`, `Root|Run`, `Root|Interact_ground`.
3. Texture: `flipY = false`, `generateMipmaps = true`, `minFilter = LinearMipmapLinearFilter`,
   `magFilter = LinearFilter`, `anisotropy = 16`. Without these she renders rough.
   Build the material yourself (MeshPhongMaterial, shininess ~10) with `skinning: true` on
   skinned meshes; the glb has no material worth keeping.
4. Scale: measure the loaded bounding box and scale so total height is **2.5 units**, which is
   what the old code-built kid stood at. Then sit her on the ground with `-box.min.y`.
   Keep `headTopY` at 2.5 so the carried stack still lands on her head.
5. She faces **+Z**, same as the old kid, so the existing `kid.rotation.y = facing + PI` still works.
6. Add a soft contact shadow: a dark translucent circle (radius ~0.5, opacity ~0.22) just above
   the grass. Without it she floats.
7. Keep the old code-built kid as the fallback if the model fails to load.

## Known and accepted
From the farm's high camera her head reads a little tall and she looks more like a small
teenager than a five year old. That is the model's geometry, not the paint. Accepted for now.

## Correction made when this went into the farm (FM9 build session)

`skin-farm-girl.png` paints the head and neck a deep maroon (135,34,26) while the
arms and hands in the same atlas stay the kit's peach (246,152,120). On the farm that
reads as a dark red mask on a peach body rather than as a girl, so the farm now loads
**`skin-farm-girl-v2.png`**: `skin-farm-a.png` with HER HAIR composited over it (the
near-black hair pixels from the head region, plus the boy's fringe dyed to match), so
every tone agrees and the only difference between the two looks is the hair.

The original file is untouched and still here. Going back to it is one path in the
`KID_LOOKS` table in `public/skyflyer-farm.html` — that is what the named slot is for.
