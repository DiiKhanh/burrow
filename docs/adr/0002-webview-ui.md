# UI của Burrow là webview, không dùng native UI của MyGo

Dù Burrow là project Go và MyGo có native UI vẽ bằng Go, toàn bộ giao diện chạy trong webview (WKWebView) với React 19 + TypeScript strict, Tailwind CSS v4 và Radix Primitives. Giao diện Mole for Mac là custom hoàn toàn (gradient theo tab, bộ đếm lăn số, card checkbox ba trạng thái, lưới bento có sparkline), nên CSS và Web Inspector là đường ngắn nhất tới pixel-perfect; engine vẽ native của MyGo mới vài tuần tuổi và còn bug render Metal ở 2x (egoist/mygo#531) đúng loại card Burrow dùng. Frontend còn tái dùng được với Wails/Tauri nếu MyGo không đi tiếp.

## Consequences

- Thêm toolchain Bun + Vite + TS và khoảng 18 MB RAM so với native.
- Go và UI nói chuyện qua typed IPC của MyGo: bound service + `mygo.Channel` cho Scan/Clean (có backpressure, đóng channel là hủy), `mygo.Event` cho Status. Type TS luôn sinh bằng `mygo generate`.
- Mọi màu, cỡ chữ, bo góc đi qua token trong `@theme` của Tailwind; component không dùng giá trị tùy ý.
