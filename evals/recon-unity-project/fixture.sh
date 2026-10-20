#!/usr/bin/env bash
# Một project Unity nhỏ: phiên bản chỉ có trong ProjectSettings/ProjectVersion.txt, logic trong Assets/Scripts.
set -euo pipefail
mkdir -p orig/MyGame/ProjectSettings orig/MyGame/Assets/Scripts orig/MyGame/Library
printf 'm_EditorVersion: 2021.3.5f1\nm_EditorVersionWithRevision: 2021.3.5f1 (40eb3a945986)\n' > orig/MyGame/ProjectSettings/ProjectVersion.txt
cat > orig/MyGame/Assets/Scripts/Player.cs <<'CS'
using UnityEngine;
public class Player : MonoBehaviour {
    public float speed = 4.5f;
    void Update() { transform.position += Vector3.right * Input.GetAxis("Horizontal") * speed * Time.deltaTime; }
}
CS
echo cache > orig/MyGame/Library/ArtifactDB
