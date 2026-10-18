// Light C# reading for Unity scripts: classes, serialized fields with their code defaults, Unity messages,
// and the constructs whose meaning changes when moved to JS. Regex-based on purpose: enough to point the
// agent at the right line, not a compiler.

/** Strip comments and string contents (keeps line numbers) so patterns don't match inside them. */
export function stripCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/@"(?:[^"]|"")*"|"(?:[^"\\\n]|\\.)*"/g, (m) => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"');
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** Unity calls these by name; each one has timing rules the port must keep. */
export const UNITY_MESSAGES = [
  'Awake', 'OnEnable', 'Start', 'FixedUpdate', 'Update', 'LateUpdate', 'OnDisable', 'OnDestroy',
  'OnTriggerEnter2D', 'OnTriggerStay2D', 'OnTriggerExit2D', 'OnCollisionEnter2D', 'OnCollisionStay2D', 'OnCollisionExit2D',
  'OnTriggerEnter', 'OnTriggerStay', 'OnTriggerExit', 'OnCollisionEnter', 'OnCollisionStay', 'OnCollisionExit',
  'OnMouseDown', 'OnMouseUp', 'OnMouseDrag', 'OnBecameVisible', 'OnBecameInvisible', 'OnApplicationPause', 'OnApplicationFocus',
  'OnValidate', 'Reset', 'OnGUI', 'OnDrawGizmos',
];

/**
 * Constructs that port wrongly when translated naively. `id` keys into the skill's pitfall table
 * (skills/engine-unity/references/pitfalls.md).
 */
export const PITFALLS = [
  { id: 'random-range', re: /\bRandom\.Range\s*\(/, msg: 'Random.Range(int,int) KHÔNG lấy max, (float,float) có lấy max — dùng rangeInt/rangeFloat' },
  { id: 'round', re: /\bMathf\.(Round|RoundToInt)\s*\(/, msg: 'Mathf.Round làm tròn .5 về số chẵn (2.5→2), Math.round thì lên (3) — dùng round()' },
  { id: 'sign', re: /\bMathf\.Sign\s*\(/, msg: 'Mathf.Sign(0) = 1, Math.sign(0) = 0 — dùng sign()' },
  { id: 'int-cast', re: /\(\s*int\s*\)/, msg: '(int) cắt về 0 (-1.5→-1), không phải Math.floor — dùng Math.trunc' },
  { id: 'int-math', re: /\bint\s+\w+\s*=[^;]*\/[^;]*;/, msg: 'chia giữa hai int trong C# là chia nguyên — dùng intDiv()' },
  { id: 'coroutine', re: /\bStartCoroutine\s*\(|\bIEnumerator\b|\byield\s+return\b/, msg: 'coroutine: đoạn trước yield đầu tiên chạy ngay; WaitForSeconds theo timeScale — dùng Scheduler.start()' },
  { id: 'invoke', re: /\b(Invoke|InvokeRepeating|CancelInvoke)\s*\(/, msg: 'Invoke/InvokeRepeating — dùng Scheduler.after()/every()' },
  { id: 'timescale', re: /\bTime\.timeScale\b/, msg: 'Time.timeScale làm chậm/dừng deltaTime, WaitForSeconds, FixedUpdate — port phải nhân dt theo đúng chỗ' },
  { id: 'unscaled', re: /\bTime\.(unscaledDeltaTime|unscaledTime|realtimeSinceStartup)\b|\bWaitForSecondsRealtime\b/, msg: 'thời gian không phụ thuộc timeScale (UI, pause) — tách khỏi dt gameplay' },
  { id: 'deltatime', re: /\bTime\.deltaTime\b/, msg: 'Time.deltaTime trong Update = dt khung hình, trong FixedUpdate = fixedDeltaTime; xem tần số fixed step' },
  { id: 'physics2d', re: /\b(Rigidbody2D|AddForce|AddTorque|\.velocity|linearVelocity|gravityScale|Physics2D\.)\b/, msg: 'vật lý Box2D: gravity, drag, gravityScale, va chạm theo collider — đọc giá trị Rigidbody2D/collider trong serialized.json' },
  { id: 'physics3d', re: /\b(Rigidbody|Physics\.(Raycast|OverlapSphere|SphereCast))\b/, msg: 'vật lý 3D (PhysX)' },
  { id: 'collision', re: /\bOn(Trigger|Collision)(Enter|Stay|Exit)(2D)?\b/, msg: 'callback va chạm: chạy sau bước vật lý, theo ma trận layer va chạm (Physics2DSettings)' },
  { id: 'destroy', re: /\bDestroy\s*\(/, msg: 'Destroy() chỉ xoá ở cuối frame; object vẫn chạy nốt frame hiện tại' },
  { id: 'animator', re: /\b(Animator|SetTrigger|SetBool|SetFloat|SetInteger|CrossFade)\b/, msg: 'Animator: trạng thái, transition, exit time nằm trong .controller — đọc mục animator trong REPORT' },
  { id: 'tween', re: /\b(DOTween|DOMove\w*|DOScale\w*|DORotate\w*|DOFade|DOLocal\w*|DOPunch\w*|DOShake\w*|LeanTween|iTween)\b/, msg: 'tween: giữ đúng ease, duration, delay, loop (DOTween mặc định Ease.OutQuad)' },
  { id: 'curve', re: /\bAnimationCurve\b/, msg: 'AnimationCurve: lấy keyframe trong serialized.json, đánh giá bằng evaluateCurve()' },
  { id: 'rotation', re: /\b(eulerAngles|Quaternion\.(?!identity\b)|\.Rotate\s*\(|localRotation|\.rotation\b)/, msg: 'góc Unity: độ, trục y hướng lên, quay ngược chiều kim đồng hồ; canvas: radian, y xuống, quay xuôi chiều' },
  { id: 'screen-space', re: /\b(Screen\.(width|height)|ScreenToWorldPoint|WorldToScreenPoint|orthographicSize|ViewportTo\w+)\b/, msg: 'đổi toạ độ màn hình ↔ world: dùng camera orthographicSize và tỉ lệ khung, không gõ số px' },
  { id: 'input-axis', re: /\bInput\.GetAxis\s*\(/, msg: 'Input.GetAxis có làm mượt (gravity/sensitivity trong InputManager); GetAxisRaw thì không' },
  { id: 'input', re: /\bInput\.(GetKey\w*|GetMouseButton\w*|GetButton\w*|touch\w*|mousePosition)\b|\bUnityEngine\.InputSystem\b/, msg: 'input: map sang Action trong src/contracts/input.ts, giữ đúng Down/Up/Held' },
  { id: 'playerprefs', re: /\bPlayerPrefs\./, msg: 'PlayerPrefs → platform.save; giữ đúng khoá và giá trị mặc định' },
  { id: 'scene-load', re: /\bSceneManager\.LoadScene\w*\b|\bApplication\.LoadLevel\b/, msg: 'chuyển scene: liệt kê thứ tự trong EditorBuildSettings; DontDestroyOnLoad giữ object qua scene' },
  { id: 'find', re: /\b(GameObject\.Find\w*|FindObjectOfType\w*|FindObjectsOfType\w*|FindWithTag)\b/, msg: 'tìm object theo tên/tag/type: thay bằng tham chiếu rõ ràng trong state' },
  { id: 'static-state', re: /\bpublic\s+static\s+(?!readonly|class|void|bool\s+\w+\s*\(|int\s+\w+\s*\(|float\s+\w+\s*\()[\w<>[\],\s]+\s+\w+\s*(=|;)/, msg: 'biến static: sống qua scene và qua lần chơi lại — reset đúng chỗ khi port' },
  { id: 'float32', re: /\bfloat\b/, msg: null }, // tracked silently: used to explain float32 drift, not reported per file
];

const FIELD = /^[ \t]*((?:\[[^\]\n]*\]\s*)*)((?:(?:public|private|protected|internal|static|readonly|const|new|volatile)\s+)*)([\w.]+(?:<[\w\s,.<>[\]]+>)?(?:\[\])?)\s+(\w+)\s*(?:=\s*([^;]+))?;/gm;
const CLASS = /\b(?:public\s+|internal\s+|sealed\s+|abstract\s+|partial\s+|static\s+)*(class|struct|enum)\s+(\w+)(?:\s*<[^>]*>)?(?:\s*:\s*([\w.<>,\s]+?))?\s*(?:where\b[^{]*)?\{/g;

/** Is this field serialized by Unity (shown in the Inspector)? */
function isSerialized(attrs, mods) {
  if (/\bNonSerialized\b/.test(attrs) || /\b(static|const|readonly)\b/.test(mods)) return false;
  return /\bpublic\b/.test(mods) || /\bSerializeField\b|\bSerializeReference\b/.test(attrs);
}

/** `5f` → 5, `-0.5f` → -0.5, `true` → true, `"x"` → "x"; anything else → undefined (not a literal). */
export function literalValue(expr) {
  if (expr == null) return undefined;
  const e = expr.trim();
  const num = e.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)[fdmFDMuUlL]?$/);
  if (num) return Number(num[1]);
  if (e === 'true' || e === 'false') return e === 'true';
  const str = e.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (str) return str[1];
  return undefined;
}

/** Find the body range of the `{` at `open` (index of the brace). */
function blockEnd(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return i;
  }
  return code.length;
}

/**
 * Scan one .cs file. Returns { classes: [{ name, kind, base, fields: [{ name, type, default, literal, line }] }],
 * messages: [...], pitfalls: [{ id, msg, lines: [...] }] }.
 */
export function scanCsharp(src) {
  const raw = src.replace(/\r\n?/g, '\n');
  const code = stripCode(raw);
  const classes = [];
  for (const m of code.matchAll(CLASS)) {
    const [, kw, name, bases] = m;
    if (kw === 'enum') continue;
    const open = m.index + m[0].length - 1;
    const end = blockEnd(code, open);
    // Only the class's own level: blank out nested blocks (methods, nested types) before matching fields.
    let body = code.slice(open + 1, end);
    let prev;
    do {
      prev = body;
      body = body.replace(/\{[^{}]*\}/g, (b) => b.replace(/[^\n]/g, ' '));
    } while (body !== prev);
    const fields = [];
    for (const f of body.matchAll(FIELD)) {
      const [, attrs, mods, type, fname, def] = f;
      if (['return', 'using', 'namespace', 'else', 'new', 'throw', 'goto', 'yield'].includes(type)) continue;
      if (!isSerialized(attrs, mods)) continue;
      // Strings are blanked in `code` but keep their length: read the initializer from the original text.
      const at = open + 1 + f.index;
      const defRaw = def == null ? null : raw.substr(at + f[0].lastIndexOf(def), def.length).trim();
      fields.push({ name: fname, type, default: defRaw, literal: literalValue(defRaw), line: lineAt(code, at) });
    }
    const base = bases?.split(',')[0].trim() ?? null;
    classes.push({ name, kind: kw, base, fields, line: lineAt(code, m.index) });
  }
  const messages = UNITY_MESSAGES.filter((n) => new RegExp(`\\b(?:void|IEnumerator)\\s+${n}\\s*\\(`).test(code));
  const pitfalls = [];
  const lines = code.split('\n');
  for (const p of PITFALLS) {
    if (!p.msg) continue;
    const hit = [];
    lines.forEach((l, i) => p.re.test(l) && hit.push(i + 1));
    if (hit.length) pitfalls.push({ id: p.id, msg: p.msg, lines: hit });
  }
  return { classes, messages, pitfalls };
}

/** MonoBehaviour / ScriptableObject / plain, following base names declared in the same project. */
export function classKind(name, byName, seen = new Set()) {
  const c = byName.get(name);
  if (!c?.base || seen.has(name)) return 'plain';
  const b = c.base.replace(/^UnityEngine\./, '').replace(/<.*$/, '');
  if (['MonoBehaviour', 'NetworkBehaviour'].includes(b)) return 'MonoBehaviour';
  if (b === 'ScriptableObject') return 'ScriptableObject';
  if (b === 'Editor' || b === 'EditorWindow') return 'Editor';
  seen.add(name);
  return byName.has(b) ? classKind(b, byName, seen) : /Behaviour$|Singleton/.test(b) ? 'MonoBehaviour' : 'plain';
}
