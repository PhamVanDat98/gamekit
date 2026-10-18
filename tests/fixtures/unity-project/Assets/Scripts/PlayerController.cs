using UnityEngine;

public class PlayerController : MonoBehaviour
{
    [Header("Movement")]
    public float speed = 5f;           // inspector overrides this
    [SerializeField] private float jumpForce = 12.5f;
    [SerializeField] int maxJumps = 2;
    public bool canDash = true;
    public string playerName = "Hero";
    [System.NonSerialized] public float runtimeOnly = 3f;
    private float hidden = 9f;
    public static int lives = 3;
    public const float GRAVITY = 2f;
    public AnimationCurve jumpCurve;
    Rigidbody2D body;

    void Awake() { body = GetComponent<Rigidbody2D>(); }

    void Update()
    {
        float h = Input.GetAxis("Horizontal");
        body.velocity = new Vector2(h * speed, body.velocity.y);
        if (Input.GetKeyDown(KeyCode.Space)) Jump();
        int lane = Mathf.RoundToInt(transform.position.x);
        int half = maxJumps / 2;
    }

    void Jump() { body.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse); }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Enemy")) Destroy(gameObject);
    }
}
