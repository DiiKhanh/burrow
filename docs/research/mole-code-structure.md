# Mole: cấu trúc code và khả năng import logic Clean/Status

Ticket: [#2](https://github.com/DiiKhanh/cleaner-app/issues/2). Nguồn: source code của [tw93/mole](https://github.com/tw93/mole) tại commit [`09afc56`](https://github.com/tw93/mole/tree/09afc56042d3fcb6de491f1416767bec5485cad3) (branch `main`, đọc ngày 2026-10-22). Mọi link dưới đây đều trỏ tới đúng commit này; `M/` là viết tắt của `https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/`.

## Kết luận ngắn

- **Clean: hướng B (import Go) KHÔNG khả thi.** Toàn bộ logic `mo clean` là Bash (khoảng 23k dòng trong `bin/clean.sh` + `lib/clean/*.sh` + `lib/core/*.sh`), không có một dòng Go nào để import. Muốn "import" thì phải port lại toàn bộ sang Go.
- **Status: hướng B về mặt kỹ thuật KHÔNG import được trực tiếp**, vì code nằm trong `cmd/status` với `package main` (Go không cho import package `main`). Chỉ có thể **copy/vendor** các file collector (`metrics*.go`) vào package riêng của Burrow; phần collector không phụ thuộc TUI nên copy khá sạch, nhưng phải tự bảo trì fork và chịu ràng buộc GPL-3.0.
- **Hướng A (gọi `mo` như subprocess):**
  - Status có interface máy đọc tốt: `mo status --json` (một snapshot) và `mo status --watch --interval 2s` (NDJSON stream).
  - Clean KHÔNG có JSON. Chỉ có `mo clean --dry-run`, ghi preview dạng text vào `~/.config/mole/clean-list.txt`; không có cách chọn từng mục để xóa (các flag `--select/--categories/--exclude` đã bị gỡ). Cách duy nhất để loại trừ là whitelist file `~/.config/mole/whitelist`. Sau khi chạy, `mo history --json` trả về JSON lịch sử dọn dẹp.

## 1. Phần nào là Go, phần nào là shell

| Thành phần | Ngôn ngữ | Vị trí |
|---|---|---|
| Entry point `mo` / `mole` | Bash | [`M/mole`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/mole#L329-L340) dispatch `clean` tới `bin/clean.sh`, `status` tới `bin/status.sh` |
| Các command (`clean`, `optimize`, `uninstall`, `purge`, `history`, ...) | Bash | `bin/*.sh` |
| Thư viện dùng chung, safety, file ops, app protection | Bash | `lib/core/*.sh`, `lib/clean/*.sh`, `lib/manage/*.sh`, ... |
| `mo analyze` | Go | `cmd/analyze/` (20 file non-test) |
| `mo status` | Go | `cmd/status/` (18 file non-test, khoảng 11.7k dòng kể cả test) |
| Helper format byte | Go | `internal/units/` (1 file) |

Đây cũng là mô tả chính thức của dự án: "Mole is a macOS system cleanup and optimization tool with shell and Go components" và "`cmd/analyze/` and `cmd/status/` - Go TUIs" ([`M/AGENTS.md#L37`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/AGENTS.md#L37), [`#L86`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/AGENTS.md#L86)). Go chỉ được build thành hai binary `analyze-go` và `status-go` ([`M/Makefile#L41-L44`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/Makefile#L41-L44)); `bin/status.sh` chỉ `exec` binary `status-go` đi kèm ([`M/bin/status.sh#L8-L15`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/status.sh#L8-L15)).

## 2. Logic `mo clean` nằm ở đâu

- Entry: [`M/bin/clean.sh`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh) (2166 dòng Bash). Nó `source` các module `lib/clean/*.sh` ([`#L25-L29`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L25-L29)).
- Module theo nhóm: `lib/clean/user.sh` (3604 dòng), `dev.sh` (5997), `project.sh` (3253), `apps.sh` (2170), `app_caches.sh` (2010), `system.sh` (1435), `caches.sh` (1187), `brew.sh` (651), `hints.sh`, `purge_shared.sh`.
- Thứ tự các nhóm (section) được hardcode trong `perform_cleanup` ([`M/bin/clean.sh#L1550`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L1550), section ở [`#L1728-L1839`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L1728-L1839)): External volume, System, User essentials, App caches, Browsers, Cloud & Office, Developer tools, Apps & utilities, Virtualization, Application Support, App leftovers, Device backups & firmware, Time Machine, Large files, Project artifacts.
- Xóa thật đi qua `safe_clean` ([`M/bin/clean.sh#L1445`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L1445)) rồi `safe_remove` ([`M/lib/core/file_ops.sh#L1451`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/file_ops.sh#L1451)), có `validate_path_for_deletion` ([`#L1138`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/file_ops.sh#L1138)); cuối cùng là `rm -rf` (không vào Trash) ([`#L1789-L1791`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/file_ops.sh#L1789-L1791)).

## 3. Logic `mo status` nằm ở đâu

- [`M/cmd/status/main.go`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/main.go): parse flag, chọn mode TUI / JSON / watch ([`#L373-L392`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/main.go#L373-L392)).
- Collector: [`M/cmd/status/metrics.go`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics.go): struct `MetricsSnapshot` ([`#L62-L95`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics.go#L62-L95)), `NewCollector` ([`#L317`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics.go#L317)), `Collect` ([`#L409`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics.go#L409)), cùng các file `metrics_cpu.go`, `metrics_memory.go`, `metrics_disk.go`, `metrics_network.go`, `metrics_battery.go`, `metrics_gpu.go`, `metrics_process.go`, `metrics_hardware.go`, `metrics_health.go`, `metrics_bluetooth.go`.
- TUI (bubbletea/lipgloss) chỉ nằm ở `main.go` và `view.go`; `metrics.go` chỉ import stdlib + `gopsutil` ([`M/cmd/status/metrics.go#L3-L16`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics.go#L3-L16)). Tức là phần collector tách được khỏi TUI.
- Collector phụ thuộc nhiều vào việc chạy lệnh hệ thống qua `runCmd` ([`M/cmd/status/metrics.go#L716-L717`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics.go#L716-L717)): `sysctl`, `vm_stat`, `memory_pressure`, `ps`, `pmset`, `ioreg`, `system_profiler`, `diskutil`, `scutil`, `route`, `powermetrics`, `osascript` (ví dụ [`metrics_memory.go#L57`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics_memory.go#L57), [`metrics_battery.go#L229`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics_battery.go#L229), [`metrics_gpu.go#L172`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics_gpu.go#L172)).

## 4. Module path và `internal/`

- Module path: `github.com/tw93/mole`, `go 1.26.0` ([`M/go.mod#L1-L3`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/go.mod#L1-L3)).
- Toàn bộ file trong `cmd/status/` đều là `package main` (ví dụ [`M/cmd/status/main.go#L2`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/main.go#L2), [`metrics.go#L1`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics.go#L1)). Go spec không cho import package `main` từ module khác, nên đây là rào cản chính, không phải `internal/`.
- Chỉ có một package dưới `internal/`: `internal/units` (format byte, [`M/internal/units/bytes.go#L1-L9`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/internal/units/bytes.go#L1-L9)), được `cmd/status/view.go` dùng ([`#L11`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/view.go#L11)). Module khác không import được, nhưng nó không quan trọng (chỉ là helper format).
- Không có package library công khai (không có `pkg/` hay package non-main nào ngoài `internal/units`).

## 5. Quy tắc clean lưu ở đâu, định dạng gì

Không có file data (JSON/YAML/TOML) nào chứa rule clean; rule nằm trực tiếp trong code Bash:

- **Danh sách path cần dọn**: hardcode thành các lời gọi `safe_clean <glob> "<mô tả>"` trong từng function, ví dụ [`M/lib/clean/user.sh#L1167-L1178`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L1167-L1178) (`~/Library/Saved Application State/*`, `~/Library/Caches/com.apple.QuickLook.thumbnailcache`, ...). Nhiều nhóm còn có guard logic (kiểm tra app đang chạy, tuổi file, timeout) ngay trong function, ví dụ `_user_safe_clean_process_guarded` ([`#L13`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L13)).
- **Nhóm rác (section)**: tên section là string trong `start_section "..."` ([`M/bin/clean.sh#L1728-L1839`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L1728-L1839)).
- **Path được bảo vệ**:
  - Default whitelist (người dùng ghi đè được): Bash array `DEFAULT_WHITELIST_PATTERNS` ([`M/lib/core/base.sh#L168-L182`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/base.sh#L168-L182)).
  - Safety whitelist (luôn merge vào): `SAFETY_WHITELIST_PATTERNS` ([`#L193`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/base.sh#L193)).
  - Logic bảo vệ: `should_protect_path` ([`M/lib/core/app_protection.sh#L401`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/app_protection.sh#L401)), `is_path_whitelisted` ([`#L678`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/app_protection.sh#L678)).
  - Danh sách bundle ID tĩnh: [`M/lib/core/app_protection_data.sh`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/app_protection_data.sh) ("Keep this file data-only", [`#L1-L4`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/app_protection_data.sh#L1-L4)), nhưng vẫn là Bash array, ví dụ `SYSTEM_CRITICAL_BUNDLES` ([`#L19`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/app_protection_data.sh#L19)), `DATA_PROTECTED_BUNDLES` ([`#L209`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/app_protection_data.sh#L209)).
  - Domain service worker được bảo vệ: `PROTECTED_SW_DOMAINS` ([`M/bin/clean.sh#L54`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L54)).
- **Whitelist của người dùng**: file text `~/.config/mole/whitelist`, một path/glob mỗi dòng, được `load_mole_whitelist` đọc ([`M/lib/core/base.sh#L452-L465`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/base.sh#L452-L465)). File tồn tại thì thay thế default, safety vẫn áp dụng; không đọc được file thì `clean` dừng ([`M/README.md#L155`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/README.md#L155), [`#L165`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/README.md#L165)).

Hệ quả: dù chọn hướng nào, Burrow cũng không thể "đọc rule" của Mole như data; rule chỉ tồn tại dưới dạng hành vi của script.

## 6. Interface máy đọc của `mo` (cho hướng A)

### Status: tốt

- `--json`: một snapshot JSON (`MetricsSnapshot`, indent 2) ([`M/cmd/status/main.go#L26`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/main.go#L26), [`#L250-L283`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/main.go#L250-L283)).
- Tự động chuyển sang JSON khi stdout không phải terminal (pipe), [`#L36-L47`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/main.go#L36-L47).
- `--watch [--interval 1s]`: NDJSON, mỗi dòng một `MetricsSnapshot` đầy đủ, dùng một collector "warm" để rate (network, disk IO) chính xác; tự thoát khi stdout đóng ([`#L31-L33`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/main.go#L31-L33), [`M/cmd/status/watch.go#L10-L44`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/watch.go#L10-L44)). Rất hợp cho Status live trong GUI.
- Lỗi một phần: collector lỗi được báo ra stderr, metrics còn lại vẫn in ra và exit 0; exit 1 khi không có core metric nào ([`main.go#L259-L271`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/main.go#L259-L271)).
- Được tài liệu hóa trong README như interface chính thức ([`M/README.md#L316-L322`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/README.md#L316-L322)).
- Lưu ý: schema JSON là struct Go nội bộ, không có versioning; cần pin version Mole.

### Clean: yếu

- Flag duy nhất: `--help`, `--debug`, `--dry-run`/`-n`, `--external <path>`, `--whitelist` (interactive) ([`M/bin/clean.sh#L2110-L2154`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L2110-L2158)). Không có `--json`.
- `--select`, `--categories`, `--exclude` đã bị gỡ: "mo clean $1 was removed in this release" ([`#L2137-L2141`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L2137-L2141)). Nghĩa là không thể bảo `mo` "chỉ xóa các mục user đã chọn"; nó xóa tất cả trừ whitelist.
- `--dry-run` ghi preview vào `~/.config/mole/clean-list.txt` ([`#L49`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L49)). Định dạng text: header comment `#`, mỗi nhóm là dòng `=== <Section> ===`, mỗi mục là `<path>  # <size>[, N items][, counted under <ancestor>]` hoặc `# size unknown` ([`#L446-L505`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L446-L505)). Parse được nhưng size đã format human-readable (không phải byte) và không phải contract chính thức.
- Dry-run chỉ có phần System nếu đã có sudo session cached ([`#L1510-L1524`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L1510-L1524)); chạy thật ở non-interactive (`! -t 0`) thì bỏ qua system-level nếu không có sudo và tự chạy user-level không hỏi ([`#L1527-L1545`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L1527-L1545)).
- Stdout là text có ANSI/spinner cho người đọc (nhiều chỗ kiểm `-t 1`), không phải format máy.
- Sau khi chạy: `mo history --json` trả JSON các session (`command`, `run_id`, `started_at`, `ended_at`, `items`, `size`, ...) và deletion ([`M/bin/history.sh#L20-L30`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/history.sh#L20-L30), [`M/lib/core/history.sh#L732-L800`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/history.sh#L732-L790), [`M/README.md#L322`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/README.md#L322)), đọc từ `~/Library/Logs/mole/operations.log` ([`history.sh#L62-L63`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/core/history.sh#L62-L63)). Dùng được để hiển thị kết quả sau khi Clean.

## 7. Đánh giá hướng B

### Clean
Không khả thi. Không có code Go nào; "import" tương đương viết lại khoảng 23k dòng Bash có rất nhiều safety guard và edge case (xem các rule an toàn trong [`M/AGENTS.md#L120-L133`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/AGENTS.md#L120-L133)), và phải tự theo kịp upstream mãi mãi.

### Status
Không import trực tiếp được, chỉ copy được. Trở ngại cụ thể:
1. `package main` trong `cmd/status`: không import được từ module khác.
2. Muốn dùng thì phải copy `metrics*.go`, `collection.go`, `diagnosis.go`, `process_watch.go`, ... vào package của Burrow và tự sync với upstream. Collector không phụ thuộc TUI nên việc tách là khả thi.
3. `internal/units` cũng phải copy (nhỏ, không đáng kể).
4. Giấy phép GPL-3.0 ([`M/LICENSE`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/LICENSE), [`M/README.md#L502`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/README.md#L502)): link/copy code vào binary của Burrow khiến Burrow phải phát hành dưới GPL-3.0. Gọi `mo` như process riêng (hướng A) ít ràng buộc hơn. README cũng yêu cầu fork phải dùng tên khác và credit Mole.
5. Collector vẫn shell-out tới tool hệ thống macOS (`system_profiler`, `ioreg`, `powermetrics`, ...), nên import cũng không bỏ được subprocess; lợi ích so với `mo status --watch` chủ yếu là tránh phụ thuộc binary Mole và có type Go sẵn.

### Gợi ý cho các ticket sau
- Status: hướng A với `mo status --watch` là đường thẳng nhất; B (copy collector) chỉ đáng nếu quyết định không bundle Mole và chấp nhận GPL.
- Clean: hướng A bị giới hạn bởi việc không chọn được từng mục (chỉ có whitelist) và không có JSON; nếu Burrow cần "preview rồi chọn mục để xóa" thì phải hoặc ghi tạm whitelist trước khi chạy, hoặc tự cài đặt logic xóa dựa trên kết quả parse `clean-list.txt`. Đây là câu hỏi cho ticket thiết kế Clean.
