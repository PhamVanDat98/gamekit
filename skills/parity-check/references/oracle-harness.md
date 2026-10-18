# Sinh oracle từ chính game gốc

Oracle `observed` tốt nhất là **kết quả chạy code của game gốc** trên một lưới đầu vào. Test parity khi đó so bản web với bản gốc, không so với cách mình hiểu bản gốc. Đây là cách REA kiểm chứng ca DX-Ball (3.205 case chạy trên x86 gốc).

Luật:
- Game của người dùng (`own`): cứ chạy. Game làm lại của người khác (`third-party`): chỉ khi người dùng đồng ý, ghi `D-n`.
- Code harness nằm **ngoài repo game** hoặc trong `.gamekit/local/harness/` (gitignored). Không commit code gốc hay code decompile.
- Đầu ra theo schema `spec/oracles/*.json`: `{ "source", "confidence": "observed", "description", "tolerance", "cases": [{ "in", "out" }] }`. `source` ghi rõ chạy bằng gì (Unity Editor 2021.3.5f1, hàm nào). Có evidence REA thì thêm `"evidence": ["ev_…"]`.
- Lưới đầu vào phủ giá trị điển hình **và biên**: level 1 và max, 0, âm, rất lớn, giữa hai nấc của bảng.
- Số thực: in đủ chữ số (`"R"`/`G17` trong C#, `repr` trong JS), đặt `tolerance` cho sai số float32 ↔ float64 (thường 1e-6 tương đối).

Mẫu dưới đây là khung để chỉnh theo game, chưa chạy trên một game cụ thể nào.

## Unity, có project (game của bạn)
Script Editor gọi đúng hàm của game rồi ghi JSON. Chạy từ menu, hoặc không cần mở Editor:
`Unity -batchmode -projectPath <project> -executeMethod GameKitOracle.Dump -quit -logFile -`

```csharp
// Assets/Editor/GameKitOracle.cs — xoá khỏi project game gốc sau khi dùng (hoặc để ngoài source control).
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class GameKitOracle
{
    [MenuItem("GameKit/Dump oracles")]
    public static void Dump()
    {
        // 1) Công thức: gọi hàm thật của game, không tính lại bằng tay.
        var speed = new List<string>();
        for (int level = 1; level <= 50; level++)
            speed.Add(Case($"{{\"level\":{level}}}", F(BallController.SpeedForLevel(level))));
        Write("ball-speed", "BallController.SpeedForLevel — Unity Editor " + Application.unityVersion, speed);

        // 2) RNG: chuỗi gốc cho vài seed (UnityEngine.Random là Xorshift128; System.Random là thuật toán khác).
        var rng = new List<string>();
        foreach (int seed in new[] { 0, 1, 42, 12345 })
        {
            Random.InitState(seed);
            var seq = new List<string>();
            for (int i = 0; i < 32; i++) seq.Add(Random.Range(0, 100).ToString(CultureInfo.InvariantCulture));
            rng.Add(Case($"{{\"seed\":{seed},\"call\":\"Random.Range(0,100)\"}}", "[" + string.Join(",", seq) + "]"));
        }
        Write("rng", "UnityEngine.Random.InitState + Range(0,100) — Unity " + Application.unityVersion, rng);
    }

    static string F(float v) => v.ToString("R", CultureInfo.InvariantCulture);
    static string Case(string input, string output) => "{\"in\":" + input + ",\"out\":" + output + "}";

    static void Write(string name, string source, List<string> cases)
    {
        var dir = Path.Combine(Application.dataPath, "../GameKitOracles");
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, name + ".json"),
            "{\"source\":\"" + source + "\",\"confidence\":\"observed\",\"cases\":[" + string.Join(",", cases) + "]}");
        Debug.Log("GameKit oracle: " + name + " (" + cases.Count + " case)");
    }
}
```

Hành vi theo thời gian (đường bay, va chạm, AI): chạy Play Mode với `Time.captureFramerate = 60` và input viết sẵn, ghi state mỗi N frame thành case `{ "in": { "tick": 120 }, "out": { "x": …, "y": … } }`. Bản web chạy cùng input ở 60 Hz và so ở cùng tick (nghĩa vụ loại `replay`/`oracle`).

## Unity Mono, chỉ còn bản build (game của bạn)
Hàm thuần (không đụng `Time`, `Physics`, `Instantiate`…) gọi được từ một chương trình .NET/Mono tham chiếu thẳng `Assembly-CSharp.dll`:

```bash
# Mono (mcs) — chạy được trên Linux/macOS/Windows
M=<game>_Data/Managed
mcs Oracle.cs -r:$M/Assembly-CSharp.dll -r:$M/UnityEngine.CoreModule.dll -out:Oracle.exe
MONO_PATH=$M mono Oracle.exe > ball-speed.json
```

```csharp
// Oracle.cs
using System;
using System.Globalization;
using System.Linq;

static class Oracle
{
    static void Main()
    {
        var cases = Enumerable.Range(1, 50).Select(level =>
            "{\"in\":{\"level\":" + level + "},\"out\":" +
            BallController.SpeedForLevel(level).ToString("R", CultureInfo.InvariantCulture) + "}");
        Console.Write("{\"source\":\"BallController.SpeedForLevel — Assembly-CSharp.dll (mono)\",\"confidence\":\"observed\",\"cases\":[" +
            string.Join(",", cases) + "]}");
    }
}
```

Hàm đụng tới engine native sẽ ném lỗi khi chạy ngoài Unity: tách phần công thức ra (đọc IL bằng ILSpy để biết nó gọi gì), hoặc dựng một project Unity tối thiểu cùng phiên bản, chép `Assembly-CSharp.dll` vào `Assets/Plugins/` rồi dùng cách ở trên. Chuỗi `System.Random` không cần game: `new System.Random(seed)` trong bất kỳ .NET nào.

## IL2CPP, native (C/C++), Unreal (game của bạn)
Không có IL để gọi lại. Theo thứ tự ưu tiên:
1. Còn project/source: dùng cách Unity ở trên.
2. **Ghi lại khi chạy**: hook hàm trên máy thật/giả lập (Frida — REA có nhóm tool `frida_*` nếu server có; hoặc frida-trace) và ghi cặp tham số → kết quả trong lúc chơi. Phủ được giá trị thực tế, ít phủ biên.
3. **Giả lập riêng hàm**: chạy đúng đoạn mã máy của hàm trong một harness (Unicorn engine, hoặc trình giả lập của Ghidra) trên lưới đầu vào. Đây là cách REA làm với DX-Ball. Hợp với hàm thuần (tính toán), không hợp với hàm gọi nhiều hàm khác.

## HTML5, Cocos, Construct, Laya (game của bạn)
Code là JS: mở bản build trong trình duyệt điều khiển bằng Playwright, gọi hàm của game trong trang rồi in kết quả.

```js
// oracle.mjs — node oracle.mjs > spec/oracles/ball-speed.json   (cần playwright)
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:8080/index.html'); // phục vụ thư mục build gốc
await page.waitForFunction(() => window.cc?.js?.getClassByName?.('BallController'));
const cases = await page.evaluate(() => {
  const Ball = cc.js.getClassByName('BallController'); // Cocos; game khác: tìm hàm qua biến toàn cục / module
  return Array.from({ length: 50 }, (_, i) => ({ in: { level: i + 1 }, out: Ball.prototype.speedForLevel.call({}, i + 1) }));
});
console.log(JSON.stringify({ source: 'BallController.speedForLevel — bản build gốc chạy trong Chromium', confidence: 'observed', cases }));
await browser.close();
```

`Math.random` của bản gốc không có seed: muốn chuỗi lặp lại thì thay `Math.random` trong trang bằng nguồn có seed **trước** khi game chạy (`page.addInitScript`), rồi ghi cả kết quả gameplay.

## Godot (game của bạn)
```gdscript
# tools/dump_oracle.gd — godot --headless --script res://tools/dump_oracle.gd
extends SceneTree
func _init():
    var Ball = load("res://ball.gd")
    var cases = []
    for level in range(1, 51):
        cases.append({"in": {"level": level}, "out": Ball.speed_for_level(level)})
    var f = FileAccess.open("user://ball-speed.json", FileAccess.WRITE)
    f.store_string(JSON.stringify({"source": "ball.gd speed_for_level — Godot headless", "confidence": "observed", "cases": cases}))
    quit()
```

## Flash
Chạy SWF bằng Ruffle (bản desktop hoặc web) để quan sát; công thức đọc từ ActionScript (FFDec) và kiểm bằng cách đo (oracle `inferred`, có `tolerance`). Không có cách gọi hàm AS3 từ ngoài một cách đơn giản.

## Sau khi có file
1. Đặt vào `spec/oracles/<tên>.json`, `gamekit validate`.
2. Nghĩa vụ trỏ tới nó: `oracle: spec/oracles/<tên>.json`, `cases: [oracle, …]`.
3. Test `it.each(oracle.cases)('[id:oracle] …')` (mẫu: `tests/core/world.test.ts`).
4. Phá thử (mục 5 của skill): sửa một dòng `out`, test phải đỏ.
