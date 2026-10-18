using UnityEngine;

public class Enemy : MonoBehaviour
{
    public int points = 10;

    void OnDestroy() { GameManager.Instance.score += points; }
}
