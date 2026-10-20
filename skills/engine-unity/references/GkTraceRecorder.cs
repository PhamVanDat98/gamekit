// GkTraceRecorder — ghi trạng thái game Unity gốc ra JSON Lines để `gamekit oracle import` dựng bảng oracle.
// Chỉ dùng với game của bạn (source.ownership: own) khi có project Unity: thả script vào Assets/, gắn vào một
// GameObject trong scene cần đo, chơi trong Editor. KHÔNG để script này trong bản phát hành của game gốc.
//
// Mỗi dòng trong `fields` là "tên cột = đường dẫn":
//   player.x     = Player/Transform.position.x            (GameObject theo đường dẫn hierarchy / Component.thành viên…)
//   speed        = Spawner/ObstacleSpawner.currentSpeed     (field hoặc property, public hay private đều đọc được)
//   level        = static:GameManager.Instance.level        (static: Kiểu.thành viên…)
// Vector2/Vector3 ghi thành object {x,y,z}; oracle import làm phẳng thành "cột.x".
// File: Application.persistentDataPath/gk-trace.jsonl (đường dẫn in ra Console khi bắt đầu).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using UnityEngine;

public class GkTraceRecorder : MonoBehaviour
{
    [Tooltip("tên cột = đường dẫn (xem đầu file)")]
    public string[] fields = { "player.x = Player/Transform.position.x" };

    [Tooltip("Ghi mỗi N lần FixedUpdate (1 = mọi bước vật lý)")]
    public int every = 1;

    [Tooltip("Dừng ghi sau số giây này (0 = đến khi thoát)")]
    public float maxSeconds = 60f;

    public string fileName = "gk-trace.jsonl";

    const BindingFlags Any = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static;

    class Probe
    {
        public string column;
        public string objectPath;   // null for static:
        public Type staticType;
        public string component;
        public string[] members;
        public GameObject cached;
    }

    readonly List<Probe> probes = new List<Probe>();
    StreamWriter writer;
    int ticks;
    float t0;

    void Start()
    {
        foreach (var line in fields)
        {
            var eq = line.IndexOf('=');
            if (eq < 0) { Debug.LogError("[GkTrace] thiếu '=' trong: " + line); continue; }
            var p = Parse(line.Substring(0, eq).Trim(), line.Substring(eq + 1).Trim());
            if (p != null) probes.Add(p);
        }
        var path = Path.Combine(Application.persistentDataPath, fileName);
        writer = new StreamWriter(path, false, new UTF8Encoding(false));
        t0 = Time.fixedTime;
        Debug.Log("[GkTrace] ghi vào " + path);
    }

    Probe Parse(string column, string path)
    {
        if (path.StartsWith("static:"))
        {
            var parts = path.Substring(7).Split('.');
            // Longest prefix that names a type: "My.Namespace.GameManager.Instance.level".
            for (var n = parts.Length - 1; n >= 1; n--)
            {
                var name = string.Join(".", parts.Take(n));
                var type = AppDomain.CurrentDomain.GetAssemblies()
                    .Select(a => a.GetType(name, false))
                    .FirstOrDefault(t => t != null);
                if (type != null) return new Probe { column = column, staticType = type, members = parts.Skip(n).ToArray() };
            }
            Debug.LogError("[GkTrace] không tìm thấy kiểu trong: " + path);
            return null;
        }
        var slash = path.LastIndexOf('/');
        if (slash < 0) { Debug.LogError("[GkTrace] cần <GameObject>/<Component>.<thành viên>: " + path); return null; }
        var rest = path.Substring(slash + 1).Split('.');
        return new Probe { column = column, objectPath = path.Substring(0, slash), component = rest[0], members = rest.Skip(1).ToArray() };
    }

    object Read(Probe p)
    {
        object cur;
        Type type;
        if (p.staticType != null)
        {
            cur = null;
            type = p.staticType;
        }
        else
        {
            if (p.cached == null) p.cached = GameObject.Find(p.objectPath); // objects spawned later are found when they appear
            if (p.cached == null) return null;
            cur = p.component == "Transform" || p.component == "transform" ? p.cached.transform : (object)p.cached.GetComponent(p.component);
            if (cur == null) return null;
            type = cur.GetType();
        }
        foreach (var m in p.members)
        {
            var f = type.GetField(m, Any);
            if (f != null) cur = f.GetValue(cur);
            else
            {
                var prop = type.GetProperty(m, Any);
                if (prop == null) return null;
                cur = prop.GetValue(cur, null);
            }
            if (cur == null) return null;
            type = cur.GetType();
        }
        return cur;
    }

    void FixedUpdate()
    {
        if (writer == null || ticks++ % Mathf.Max(1, every) != 0) return;
        var t = Time.fixedTime - t0;
        if (maxSeconds > 0 && t > maxSeconds) { Close(); return; }
        var sb = new StringBuilder();
        sb.Append("{\"t\":").Append(Num(t)).Append(",\"frame\":").Append(Time.frameCount);
        foreach (var p in probes)
        {
            object v;
            try { v = Read(p); } catch (Exception) { v = null; }
            sb.Append(",\"").Append(Escape(p.column)).Append("\":").Append(Json(v));
        }
        sb.Append('}');
        writer.WriteLine(sb.ToString());
    }

    static string Num(double d) => double.IsNaN(d) || double.IsInfinity(d) ? "null" : d.ToString("R", CultureInfo.InvariantCulture);

    static string Escape(string s) => s.Replace("\\", "\\\\").Replace("\"", "\\\"");

    static string Json(object v)
    {
        switch (v)
        {
            case null: return "null";
            case bool b: return b ? "true" : "false";
            case float f: return Num(f);
            case double d: return Num(d);
            case Vector2 a: return "{\"x\":" + Num(a.x) + ",\"y\":" + Num(a.y) + "}";
            case Vector3 a: return "{\"x\":" + Num(a.x) + ",\"y\":" + Num(a.y) + ",\"z\":" + Num(a.z) + "}";
            case Enum e: return "\"" + e + "\"";
            default:
                // int, long, short, byte… (C# 7 syntax so Unity 2018+ compiles it)
                if (v.GetType().IsPrimitive && !(v is char)) return Convert.ToString(v, CultureInfo.InvariantCulture);
                return "\"" + Escape(v.ToString()) + "\"";
        }
    }

    void Close()
    {
        if (writer == null) return;
        writer.Flush();
        writer.Dispose();
        writer = null;
        Debug.Log("[GkTrace] đã ghi xong " + ticks + " bước");
    }

    void OnDisable() => Close();
    void OnApplicationQuit() => Close();
}
