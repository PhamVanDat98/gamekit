// GameKitRecorder.cs — chép vào Assets/ của PROJECT UNITY (không chép vào repo game web).
// Ghi trạng thái thật của game theo từng bước FixedUpdate thành bảng oracle của GameKit
// (định dạng spec/oracles/*.json). Gắn lên một GameObject trong scene, điền Tracks, bấm Play.
// File ra: <project Unity>/gamekit-oracle-<oracleName>.json khi đủ maxSteps hoặc khi dừng Play.
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using UnityEngine;
using UnityEngine.SceneManagement;

[DefaultExecutionOrder(10000)] // chạy sau mọi script gameplay trong cùng bước
public class GameKitRecorder : MonoBehaviour
{
    [System.Serializable]
    public class Track
    {
        public Transform target;
        [Tooltip("Field hoặc property cần ghi, dạng Component.member — vd PlayerController.speed, Rigidbody2D.velocity")]
        public string[] fields = new string[0];
    }

    public string oracleName = "trace";
    public Track[] tracks = new Track[0];
    [Tooltip("Ghi một dòng mỗi N bước FixedUpdate")] public int everyNSteps = 5;
    public int maxSteps = 500;
    public int randomSeed = 1;
    [Tooltip("Phím ghi lại mỗi bước, để phát lại cùng input trên web")] public KeyCode[] keys = new KeyCode[0];

    readonly List<string> cases = new List<string>();
    readonly HashSet<string> held = new HashSet<string>();
    int step;
    bool written;

    void Awake()
    {
        Random.InitState(randomSeed);
    }

    void Update()
    {
        // Phím nhấn giữa hai bước FixedUpdate vẫn được tính cho bước kế tiếp.
        foreach (var k in keys) if (Input.GetKey(k)) held.Add(k.ToString());
    }

    void FixedUpdate()
    {
        if (written) return;
        step++;
        if (step % Mathf.Max(1, everyNSteps) == 0) cases.Add(Snapshot());
        held.Clear();
        if (step >= maxSteps) Write();
    }

    void OnDisable() { Write(); }

    string Snapshot()
    {
        var sb = new StringBuilder();
        sb.Append("{\"in\":{\"step\":").Append(step).Append(",\"time\":").Append(F(Time.fixedTime));
        if (keys.Length > 0)
        {
            sb.Append(",\"keys\":[");
            bool firstKey = true;
            foreach (var k in held) { if (!firstKey) sb.Append(','); sb.Append('"').Append(Esc(k)).Append('"'); firstKey = false; }
            sb.Append(']');
        }
        sb.Append("},\"out\":{");
        bool first = true;
        foreach (var t in tracks)
        {
            if (t == null || t.target == null) continue; // object đã bị Destroy
            string n = t.target.name;
            Num(sb, ref first, n + ".x", t.target.position.x);
            Num(sb, ref first, n + ".y", t.target.position.y);
            Num(sb, ref first, n + ".rot", t.target.eulerAngles.z);
            Num(sb, ref first, n + ".active", t.target.gameObject.activeInHierarchy ? 1 : 0);
            foreach (var f in t.fields)
            {
                object v = Read(t.target, f);
                if (v != null) Value(sb, ref first, n + "." + f, v);
            }
        }
        sb.Append("}}");
        return sb.ToString();
    }

    static object Read(Transform target, string spec)
    {
        int dot = spec.IndexOf('.');
        if (dot < 0) return null;
        Component comp = target.GetComponent(spec.Substring(0, dot));
        if (comp == null) return null;
        string member = spec.Substring(dot + 1);
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        FieldInfo fi = comp.GetType().GetField(member, flags);
        if (fi != null) return fi.GetValue(comp);
        PropertyInfo pi = comp.GetType().GetProperty(member, flags);
        return pi != null ? pi.GetValue(comp, null) : null;
    }

    static void Value(StringBuilder sb, ref bool first, string key, object v)
    {
        if (v is float f) Num(sb, ref first, key, f);
        else if (v is double d) Num(sb, ref first, key, d);
        else if (v is int i) Num(sb, ref first, key, i);
        else if (v is bool b) Num(sb, ref first, key, b ? 1 : 0);
        else if (v is System.Enum) Num(sb, ref first, key, System.Convert.ToInt32(v));
        else if (v is Vector2 v2) { Num(sb, ref first, key + ".x", v2.x); Num(sb, ref first, key + ".y", v2.y); }
        else if (v is Vector3 v3) { Num(sb, ref first, key + ".x", v3.x); Num(sb, ref first, key + ".y", v3.y); Num(sb, ref first, key + ".z", v3.z); }
        else
        {
            if (!first) sb.Append(',');
            sb.Append('"').Append(Esc(key)).Append("\":\"").Append(Esc(v.ToString())).Append('"');
            first = false;
        }
    }

    static void Num(StringBuilder sb, ref bool first, string key, double v)
    {
        if (!first) sb.Append(',');
        sb.Append('"').Append(Esc(key)).Append("\":").Append(F(v));
        first = false;
    }

    static string F(double v) => double.IsNaN(v) || double.IsInfinity(v) ? "null" : v.ToString("R", CultureInfo.InvariantCulture);
    static string Esc(string s) => s.Replace("\\", "\\\\").Replace("\"", "\\\"");

    void Write()
    {
        if (written || cases.Count == 0) return;
        written = true;
        string dir = Directory.GetParent(Application.dataPath).FullName;
        string file = Path.Combine(dir, "gamekit-oracle-" + oracleName + ".json");
        string source = "Unity " + Application.unityVersion + ", scene " + SceneManager.GetActiveScene().path +
            ", GameKitRecorder: " + step + " bước FixedUpdate (fixedDeltaTime " + F(Time.fixedDeltaTime) + " s), ghi mỗi " +
            everyNSteps + " bước, Random seed " + randomSeed;
        var sb = new StringBuilder();
        sb.Append("{\n  \"source\": \"").Append(Esc(source)).Append("\",\n  \"confidence\": \"observed\",\n  \"cases\": [\n    ");
        sb.Append(string.Join(",\n    ", cases));
        sb.Append("\n  ]\n}\n");
        File.WriteAllText(file, sb.ToString(), new UTF8Encoding(false));
        Debug.Log("GameKitRecorder: đã ghi " + cases.Count + " dòng vào " + file);
    }
}
