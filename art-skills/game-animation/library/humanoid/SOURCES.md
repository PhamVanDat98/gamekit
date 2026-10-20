# Nguồn chuyển động mocap

`walk`, `run`, `jump`, `zombie-walk` được tạo từ motion capture thật bằng `animate.py mocap` (nhìn ngang, tại chỗ, chân là đích IK). `idle`, `attack`, `hit` là keyframe viết tay.

| Animation | Dữ liệu gốc | Giấy phép | Lệnh |
| --- | --- | --- | --- |
| `walk` | CMU Graphics Lab Motion Capture Database, subject 02 trial 01 (walk), bản BVH của cgspeed (Bruce Hahne) | Dùng tự do cho nghiên cứu và sản phẩm thương mại | `mocap 02_01.bvh --start 1 --cycle --frames 8` |
| `run` | CMU, subject 09 trial 02 (run) | như trên | `mocap 09_02.bvh --start 1 --cycle --frames 8` |
| `jump` | Meta Animated Drawings, `examples/bvh/fair1/jumping.bvh` | MIT (bên dưới) | `mocap jumping.bvh --once --start 220 --end 440 --frames 16 --keys 48` |
| `zombie-walk` | Meta Animated Drawings, `examples/bvh/fair1/zombie.bvh` | MIT (bên dưới) | `mocap zombie.bvh --cycle --frames 12` |

- CMU: http://mocap.cs.cmu.edu — "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217." Bản BVH: https://github.com/Shriinivas/cmubvh (gói lại bản cgspeed).
- Animated Drawings: https://github.com/facebookresearch/AnimatedDrawings

```
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
