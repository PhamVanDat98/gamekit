using System.Collections;
using UnityEngine;

public class Spawner : MonoBehaviour
{
    public float interval = 2f;
    public int maxAlive = 5;
    public GameObject prefab;

    void Start() { StartCoroutine(Loop()); }

    IEnumerator Loop()
    {
        while (true)
        {
            int lane = Random.Range(0, 3);
            if (GameManager.Instance.score < 0) yield break;
            Instantiate(prefab, new Vector3(lane, 6, 0), Quaternion.identity);
            yield return new WaitForSeconds(interval);
        }
    }
}
