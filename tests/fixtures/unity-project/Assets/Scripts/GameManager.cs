using UnityEngine;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance;
    public LevelData level;
    public PlayerController player;
    public Spawner spawner;
    public int score;

    void Awake() { Instance = this; }
}
