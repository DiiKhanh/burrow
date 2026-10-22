# MyGo có đủ dùng cho Burrow không?

Ticket: [#3](https://github.com/DiiKhanh/cleaner-app/issues/3). Ngày nghiên cứu: 2026-10-22.

Nguồn chính: docs site https://mygo.egoist.dev/ và source repo https://github.com/egoist/mygo, đọc tại commit
[`5bb0f957`](https://github.com/egoist/mygo/tree/5bb0f957371fe7921fa975be8060aa2abebc16c8) (HEAD ngày 2026-10-22, sau tag `v0.6.2`).
Mọi link `src:` bên dưới trỏ vào commit đó. Docs site render cùng các file `docs/*.md` trong repo
(ví dụ `docs/ui/sidebar.md` = https://mygo.egoist.dev/docs/ui/sidebar).

Quy ước: **[fact]** là điều nguồn nói trực tiếp; **[suy luận]** là đánh giá của người viết dựa trên các fact đó.

## TL;DR

- MyGo **đủ về mặt tính năng** cho Burrow v1 ở cả hai chế độ. Native UI có sẵn đúng các widget Burrow cần: `Sidebar` kiểu Finder, `Checkbox`/`CheckboxGroup` (tri-state), `List`/`Table` ảo hóa, `Progress`, `Meter`, package `ui/chart` có đường dẫn tối ưu cho dữ liệu live, theme theo light/dark + accent của macOS, vibrancy và Liquid Glass. Webview mode có typed IPC với **channel streaming** (có backpressure) và **typed events** Go -> UI.
- Đóng gói `.app` + `.dmg` cho Apple Silicon (hoặc universal) là **lệnh có sẵn** (`mygo build`), có ký Developer ID + notarize.
- Rủi ro lớn nhất là **độ trưởng thành**: repo mới tạo 2026-09-26 (khoảng 4 tuần), đã lên v0.6.2 qua 6 minor release trong 4 tuần, API native UI từng có breaking change cần codemod, 50 issue đang mở trong đó có bug render Metal. Gần như một maintainer chính.
- Native UI hợp với Burrow hơn về hiệu năng và "một ngôn ngữ"; webview an toàn hơn về độ trưởng thành của phần UI (HTML/CSS/JS chart libs đã chín) và dễ bắt chước pixel-perfect giao diện "Mole for Mac". Quyết định để lại cho ticket grilling.

## 1. MyGo là gì, hai chế độ UI

- [fact] Mỗi cửa sổ MyGo hiển thị một trong hai loại giao diện, một app có thể trộn cả hai: (a) web page trong webview của OS (WKWebView trên macOS), không bundle browser; (b) native UI viết bằng Go với package `ui`, MyGo tự vẽ trên GPU (Metal trên macOS), không HTML/JS/webview. src: [`README.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/README.md), [`docs/ui/README.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/README.md)
- [fact] Pure Go, không cgo: gọi AppKit/WebKit qua [purego](https://github.com/ebitengine/purego) (`dlopen` + `objc_msgSend`). src: [`docs/architecture.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/architecture.md), [`go.mod`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/go.mod)
- [fact] Yêu cầu Go 1.27+; project webview cần thêm Bun cho tooling frontend, project native chỉ cần Go. src: [`docs/getting-started.md` L10](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/getting-started.md#L10)
- [fact] Số liệu trang chủ: binary ~7 MB, RAM native UI ~44 MB, RAM có webview ~62 MB, CPU idle 0%. src: https://mygo.egoist.dev/
- [fact] Docs tự định vị: "native UI suits tools, settings, inspectors and utilities, and apps that must start instantly; web pages suit rich documents, existing web code and what only a browser does". src: [`docs/README.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/README.md)
- [suy luận] Burrow (tiện ích hệ thống: list, checkbox, progress, chart) nằm đúng nhóm "tools/utilities" mà native UI nhắm tới.
- [fact, liên quan Mole] Module Go của Mole khai báo `go 1.26.0` và dùng `gopsutil/v4`, `bubbletea`. src: https://raw.githubusercontent.com/tw93/mole/main/go.mod. [suy luận] Tương thích với yêu cầu Go 1.27 của MyGo (Go mới build được module cũ hơn); Burrow có thể import trực tiếp package Go của Mole hoặc gọi CLI `mo`.

## 2. So sánh native UI và webview theo nhu cầu Burrow

| Nhu cầu Burrow | Native UI (package `ui`) | Webview (WKWebView + frontend tùy chọn) |
|---|---|---|
| Sidebar | [fact] `ui.Sidebar` là "source list, as the sidebars of Finder and Mail": section thu gọn được, icon, badge, điều hướng phím, item chọn tô accent khi focus và xám khi không, "as AppKit's"; tích hợp router. src: [`docs/ui/sidebar.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/sidebar.md) | Tự viết bằng HTML/CSS hoặc dùng component library web. Không có sidebar dựng sẵn từ MyGo. |
| List có checkbox theo category | [fact] `ui.Checkbox` bind `*bool`; `ui.CheckboxGroup` là checkbox cha tri-state (checked/mixed/none) cho các checkbox con, đúng mô hình "category > item". src: [`docs/ui/checkbox.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/checkbox.md). [fact] `ui.List` chỉ build các row đang hiện, "a list of millions of rows is as fast as one of ten"; `ui.Table` có cột sort/resize. src: [`docs/ui/list.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/list.md), [`docs/ui/table.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/table.md). [suy luận] `CheckboxGroup` dựng các con bên trong nó, nên với category có hàng nghìn file trong một `List` ảo hóa, có thể phải tự tính trạng thái mixed và dùng `CheckboxBase`. | HTML `<input type=checkbox>` + `indeterminate`, virtual list từ thư viện web (react-window, TanStack Virtual...). Chín muồi, nhưng phải tự chọn và tích hợp. |
| Progress khi xóa | [fact] `ui.Progress(c, v)` 0..1, giá trị âm là indeterminate; `ui.Spinner`; plugin `loading` có 29 indicator. src: [`docs/ui/progress.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/progress.md), [`docs/plugins/loading.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/plugins/loading.md) | `<progress>` hoặc CSS. Dữ liệu progress đẩy qua Channel/Event (mục 3). |
| Chart realtime CPU/RAM/disk/net | [fact] Package `ui/chart` "headless" kiểu visx/Swift Charts: scale linear/band/time, axes, line/area/stack/pie-donut, selection bằng chuột/phím. Có mục "Live data": `chart.MinMax` giảm mẫu theo cột pixel, `LineInto` không cấp phát, `Painter.StrokePolyline` vẽ trên GPU; ví dụ `examples/chart-streaming` cuộn 3 waveform 15.000 mẫu, 1.000 mẫu/giây mỗi đường. Không có: log scale, zoom/pan, legend, label tự tránh nhau. src: [`docs/ui/chart.md` L141 Live data](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/chart.md#L141), [L258](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/chart.md#L258), [`examples/chart-streaming/main.go`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/examples/chart-streaming/main.go). [fact] `ui.Meter` cho mức dùng disk có ngưỡng Warning/Critical. src: [`docs/ui/meter.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/meter.md). [suy luận] Status của Burrow cập nhật khoảng 1 Hz, thấp hơn nhiều so với mức ví dụ chứng minh; legend phải tự dựng (một row text). | Bất kỳ chart lib JS nào (uPlot, Chart.js, ECharts...): rất chín muồi, có legend/tooltip/zoom sẵn. Chi phí: JSON qua IPC mỗi tick (nhỏ ở 1 Hz). |
| Theming giống macOS | [fact] Theme mặc định theo light/dark của hệ thống khi đổi, theo accent color, Increase Contrast, Reduce Motion; góc bo "curve continuously as AppKit's and SwiftUI's do" trên macOS; tùy biến bằng cách copy theme và `c.SetTheme`. src: [`docs/ui/styling.md` L112](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/styling.md#L112). [fact] Vibrancy cửa sổ trên macOS, ví dụ sidebar trong suốt trên material. src: [`docs/ui/windows.md` L44](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/windows.md#L44). [fact] Title bar ẩn để view tự vẽ (`TitleBarHidden`, `c.TitleBar()`, `DragWindow`). src: cùng file. [fact] Plugin `glass` vẽ Liquid Glass của macOS 26 bằng shader của MyGo. src: [`docs/plugins/glass.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/plugins/glass.md). [fact] Có gradient, shadow, inset shadow, blur, màu Display P3 (`ui.Oklch`). src: `docs/ui/styling.md`. [suy luận] Control là do MyGo **tự vẽ** mô phỏng AppKit, không phải NSControl thật; muốn giống "Mole for Mac" vẫn phải tự style. | CSS đầy đủ, `-apple-system` font, `backdrop-filter`; vibrancy cửa sổ là tùy chọn window chung. [suy luận] Đây là con đường ít rủi ro nhất để đạt pixel-perfect theo mockup, vì có DevTools và CSS quen thuộc. |
| Gọi Go | Không cần IPC: view là hàm Go đọc thẳng state. Goroutine nền cập nhật state qua `Window.Update(func)` chạy trên main thread rồi vẽ frame mới. src: [`docs/ui/views.md` L168](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/views.md#L168) | Typed IPC, client TypeScript sinh tự động (mục 3). |
| Hiệu năng | [fact] Vẽ frame chỉ khi có thay đổi; idle không vẽ; từ v0.6.0 chỉ vẽ lại vùng thay đổi, cửa sổ khuất không vẽ. src: [`docs/ui/rendering.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/rendering.md), [release v0.6.0](https://github.com/egoist/mygo/releases/tag/v0.6.0). [fact] Benchmark (M5, CPU renderer): 1.000 label 397 µs/frame, row hiển thị của list 1 triệu row 14,5 µs/frame. src: [`docs/ui/performance.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/performance.md) | WKWebView: thêm khoảng 18 MB RAM so với native theo số liệu trang chủ (62 vs 44 MB). |
| Test | [fact] `ui.Tester` chạy view không cần cửa sổ, nhanh như unit test. src: [`docs/ui/testing.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/testing.md) | Test frontend bằng tool web; `Page.Eval` để automation từ Go. src: [`docs/bindings.md` L371](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/bindings.md#L371) |
| Độ trưởng thành của từng chế độ | [suy luận] Engine render, layout flexbox, widget đều mới viết trong vài tuần; v0.6.0 viết lại phần lớn đường vẽ (partial frames, layout tăng dần). Nhiều issue mở thuộc native UI (mục 6). | [suy luận] Phần UI dựa trên WKWebView và hệ sinh thái web, đã chín. Phần MyGo-riêng (bridge, IPC, codegen) vẫn mới như native. |

Lưu ý: hai chế độ có thể trộn trong một app, thậm chí trong một cửa sổ (`ui.WebView` nhúng trang web dưới native UI). src: [`docs/ui/web-view.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/web-view.md)

## 3. IPC giữa Go và UI

Chỉ áp dụng cho webview; native UI gọi Go trực tiếp (xem bảng trên). Tất cả từ [`docs/bindings.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/bindings.md):

- **Bound services** [fact]: `mygo.Bind(&Svc{})`; mọi exported method gọi được từ trang. Method nhận tham số JSON-encodable, tùy chọn `context.Context` đầu tiên (bị hủy khi trang điều hướng đi hoặc cửa sổ đóng), trả về value/error. Mỗi lần gọi chạy trên goroutine riêng, panic được recover và trả về như error. ([L12](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/bindings.md#L12), [L69](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/bindings.md#L69))
- **Typed client** [fact]: `mygo generate` sinh `src/mygo.ts` từ code Go, gồm interface cho struct, union cho named string constants, TSDoc từ Go doc comment; `mygo dev` tự sinh lại khi Go đổi. Dữ liệu qua JSON theo `encoding/json/v2`. ([L102](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/bindings.md#L102))
- **Events (Go -> UI, kéo dài)** [fact]: `var Tick = mygo.NewEvent[T]("name")`; `Emit(win, v)` cho một cửa sổ, `Broadcast(v)` cho tất cả; `Emit` trả error khi cửa sổ đã đóng để kết thúc vòng lặp; event phát trước khi DOM sẵn sàng được giao sau. Phía TS: `events.tick.on(cb)`. ([L211](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/bindings.md#L211))
- **Channels (stream theo một lần gọi)** [fact]: tham số `*mygo.Channel[T]`; phía TS `new Channel<T>()` rồi `for await`. Giá trị đến đúng thứ tự, trước khi promise settle; trang đóng channel thì `Send` trả `ErrChannelClosed` và context bị hủy; **`Send` chờ khi trang còn hơn 1 MiB chưa lấy** (backpressure). ([L266](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/bindings.md#L266), [L317](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/bindings.md#L317))
- **Bảo mật** [fact]: chỉ trang của chính app (và localhost khi dev) gọi được Go; origin khác phải nằm trong `TrustedOrigins`; iframe không bao giờ gọi được. ([L350](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/bindings.md#L350))

[suy luận] Ánh xạ cho Burrow:
- Clean scan: `Cleaner.Scan(ctx, ch *mygo.Channel[ScanItem]) (Summary, error)`; người dùng bấm Cancel thì `ch.close()` hủy context, dừng scan.
- Clean delete: tương tự, channel progress `{done,total,bytesFreed}`.
- Status: một goroutine `Broadcast` event `status` mỗi giây với struct metrics; trang subscribe khi mở tab Status.

## 4. Đóng gói `.app` cho Apple Silicon

Từ [`docs/distribution.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/distribution.md):

- [fact] `go tool mygo build` (native) hoặc `bun run build` (webview) tạo trong `build/darwin-arm64/`: `My App.app` đã ký và `My App 0.1.0 arm64.dmg`. `-platform darwin/universal` gộp arm64 + amd64. Không cgo nên cross-compile được; nhưng **ký và tạo DMG chỉ trên macOS**. ([L34](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/distribution.md#L34))
- [fact] Mặc định ký ad hoc: chạy được trên máy build, Gatekeeper chặn trên máy khác. Để phát hành: `macos.signingIdentity` (Developer ID) + `macos.notarize.keychainProfile`; `mygo build` ký hardened runtime, nộp notary, staple vào DMG và app. ([L261](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/distribution.md#L261), [L268](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/distribution.md#L268))
- [fact] `macos.infoPlist`, `macos.entitlements`, `macos.minimumSystemVersion` (mặc định 12.0), provisioning profile; icon từ `resources/icon.png` hoặc Icon Composer `.icon`. ([L316](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/distribution.md#L316))
- [fact] Helper executable (ví dụ binary `mo` hoặc script của Mole) đặt trong `resources/darwin-arm64/...`, được ký cùng app "from the inside out"; lấy đường dẫn qua `App.Path(mygo.PathResources)`. ([L198](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/distribution.md#L198))
- [fact] Auto-update có ký, delta update, cửa sổ update kiểu Sparkle; workflow GitHub Actions build/ký/notarize khi push tag. src: [`docs/updates.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/updates.md), [`docs/github-actions.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/github-actions.md)

## 5. Desktop API liên quan Burrow

- [fact] `mygo.Shell.TrashItem(path)` đưa vào Trash, "never deletes for good": nếu không vào được Trash thì lỗi và giữ nguyên file. `ShowItemInFolder` mở Finder. src: [`docs/native.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/native.md) (mục "The shell").
- [fact] Có dialog, notification, tray/menu bar, power (sleep/wake, on battery), network status (online/metered, không phải throughput). src: [`docs/native.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/native.md), bảng platform trong [`docs/architecture.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/architecture.md).
- [fact, phủ định] Docs không có API nâng quyền admin (không có mục authorization/privilege) và không có API metrics CPU/RAM/disk I/O/network throughput. (grep `admin|privilege|sudo|authorization` trong `docs/` chỉ ra kết quả liên quan Linux apt và Windows installer.)
- [suy luận] Metrics cho Status phải lấy từ Go (ví dụ code status của Mole, vốn dùng `gopsutil/v4`); xóa file cần quyền root (một số target của Mole) phải tự giải quyết ngoài MyGo (ví dụ helper + `osascript ... with administrator privileges` hoặc SMJobBless/SMAppService). Đây là việc của Go/macOS, không phụ thuộc chế độ UI.

## 6. Độ trưởng thành

- [fact] Repo tạo 2026-09-26, push gần nhất 2026-10-22; 725 commit; 2.587 star, 140 fork; MIT. (`gh repo view egoist/mygo`, `git log` tại `5bb0f957`)
- [fact] Nhịp release: v0.1.0 (09-27), v0.2.0 (10-03), v0.3.0 (10-08), v0.4.0 (10-10), v0.5.0 (10-15), v0.6.0/0.6.1/0.6.2 (10-21). (`git for-each-ref refs/tags`) Khoảng 259 commit chỉ trong tuần 10-15 đến 10-22.
- [fact] Contributor: EGOIST 466 + egoist 23 commit, "Claude" 82, github-actions 43, các người khác mỗi người dưới 15. (`git shortlog -sn HEAD`) [suy luận] Bus factor gần như 1.
- [fact] Breaking change: v0.3.1 đổi API element sang "checked elements" kèm codemod `mygo migrate-ui` và `mygo vet`. src: [`docs/ui/migration.md`](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/migration.md), commit `d2d14e91`. v0.6.0 có mục "Upgrading from 0.5" (chủ yếu Windows/test). src: [release v0.6.0](https://github.com/egoist/mygo/releases/tag/v0.6.0)
- [fact] Issue: 50 mở, 92 đóng (tại thời điểm đọc). Một số liên quan Burrow:
  - [#531](https://github.com/egoist/mygo/issues/531) Metal vẽ thêm một đường viền trong cạnh trên của box có border ở scale 2x (CPU renderer đúng): ảnh hưởng trực tiếp Retina Mac.
  - [#528](https://github.com/egoist/mygo/issues/528) macOS: kéo cửa sổ bằng phần tử `--app-region: drag` chỉ chạy lúc được lúc không (webview, title bar tùy biến).
  - [#565](https://github.com/egoist/mygo/issues/565) Không có cách ẩn element mà bỏ luôn chỗ của nó trong layout (native UI).
  - [#222](https://github.com/egoist/mygo/issues/222) Bóng xám khi kéo cửa sổ nhanh.
  - [#424](https://github.com/egoist/mygo/issues/424), [#105](https://github.com/egoist/mygo/issues/105) Roadmap/thiếu component native UI (data grid nâng cao, docking, status bar...).
- [fact] App thực tế (tự khai trong [#533 "Awesome mygo"](https://github.com/egoist/mygo/issues/533)): [RcloneDrive](https://github.com/younland/RcloneDrive) (native UI, tray, auto-update), [MixMusic](https://github.com/fzn0x/mixmusic) (music player đa nền tảng), [ApiGo](https://github.com/younland/apigo) (native UI, công cụ API kiểu Hoppscotch). Repo có 32 ví dụ trong [`examples/`](https://github.com/egoist/mygo/tree/5bb0f957371fe7921fa975be8060aa2abebc16c8/examples), gồm `gallery` (toàn bộ control, có file `charts.go`), `chart-streaming`, `vibrancy`, `menubar-native`. [suy luận] Chưa thấy app thương mại lớn nào; tất cả đều mới vài tuần tuổi.

## 7. Hạn chế và rủi ro đã biết

1. [suy luận từ mục 6] **API churn**: pre-1.0, minor release gần như mỗi tuần, đã có breaking change. Cần pin version và chấp nhận chi phí nâng cấp.
2. [fact #531] **Bug render Metal ở 2x** ảnh hưởng box có border, đúng loại card/list Burrow sẽ dùng. Có thể lách bằng shadow/inset shadow thay border cho đến khi sửa.
3. [suy luận] **Control tự vẽ**: native UI không dùng NSControl thật, nên độ "giống macOS" phụ thuộc chất lượng mô phỏng của MyGo; chi tiết nhỏ (focus ring, hover, animation) có thể lệch. Với mục tiêu "giống Mole for Mac" (vốn là giao diện custom chứ không phải AppKit chuẩn) điều này ít quan trọng hơn khả năng style tùy ý.
4. [fact, `docs/ui/chart.md` L258] **Chart thiếu** legend, log scale, zoom/pan. Đủ cho Status v1, phải tự dựng legend và tooltip.
5. [fact, mục 5] **Không có API nâng quyền admin** và **không có metrics hệ thống**: phải tự làm bằng Go, độc lập chế độ UI.
6. [fact, `docs/distribution.md`] Ký/DMG/notarize **chỉ trên macOS**; cần Apple Developer Program để phân phối ngoài máy build.
7. [suy luận] **Bus factor**: một maintainer chính, phần lớn commit trong 4 tuần; nếu dự án chậm lại, Burrow phải tự fork.
8. [suy luận] Webview mode thêm toolchain (Bun, Vite, TS) và lớp JSON IPC, nhưng giảm rủi ro ở phần UI vì phần đó dựa trên WKWebView đã chín.

## 8. Tóm tắt trade-off (để grilling quyết định)

| Tiêu chí | Native UI | Webview |
|---|---|---|
| Đủ widget cho Clean + Status v1 | Có, dựng sẵn (Sidebar, CheckboxGroup, List, Progress, Meter, chart) | Có, qua hệ sinh thái web (phải chọn lib) |
| Chart realtime | Có, headless, tự style, thiếu legend | Rất chín muồi (uPlot/ECharts...) |
| Giống "Mole for Mac" pixel-perfect | Làm được (gradient, blur, vibrancy, glass) nhưng tooling soi lỗi ít (có [Inspector](https://github.com/egoist/mygo/blob/5bb0f957371fe7921fa975be8060aa2abebc16c8/docs/ui/inspector.md) riêng) | Dễ nhất (CSS + Web Inspector) |
| IPC | Không cần; `Window.Update` từ goroutine | Typed, có Channel stream + backpressure và Event |
| Một ngôn ngữ, ít toolchain | Chỉ Go | Go + TS + Bun/Vite |
| Hiệu năng/RAM | ~44 MB, khởi động tức thì | ~62 MB |
| Rủi ro trưởng thành | Cao: engine vẽ/layout mới vài tuần, bug Metal mở | Trung bình: UI chín, phần bridge MyGo vẫn mới |
| Đóng gói `.app` arm64/universal, ký, notarize, auto-update | Như nhau | Như nhau |
| Lối thoát nếu MyGo không ổn | Phải viết lại UI | Frontend tái dùng được với Wails/Tauri/Electron, chỉ thay lớp bridge |

[suy luận] Kết luận cho ticket #3: MyGo **đủ dùng** cho Burrow v1 về tính năng và đóng gói. Câu hỏi còn mở cho ticket grilling là chọn chế độ nào và chấp nhận mức rủi ro trưởng thành nào: native UI cho trải nghiệm và stack gọn nhất, webview cho rủi ro UI thấp nhất và đường lui rẻ nhất. Một prototype nhỏ (sidebar + list checkbox + chart 1 Hz) ở chế độ native trên Retina Mac sẽ kiểm chứng nhanh nhất rủi ro #531 và độ "giống macOS".
