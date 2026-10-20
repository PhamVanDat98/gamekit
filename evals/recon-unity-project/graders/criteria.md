---
type: llm
---

PASS if the answer says the game is a Unity source project (not a build), version 2021.3.5f1, that the logic is in the C# scripts under Assets/ (for example Assets/Scripts/Player.cs), and that the analysis step can read that C# directly / open it in the Unity Editor of that version.
FAIL if it names a different engine or version, says decompilers such as ILSpy, Il2CppDumper or Ghidra are needed for this project, or claims it ran or played the game.
