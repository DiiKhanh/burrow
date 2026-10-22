# Cách xóa gắn với junk group, và Burrow tự kiểm tra lại từng path

Vì Burrow tự xóa thay cho Mole (ADR 0001), nó mất các guard lúc xóa của Mole (`validate_path_for_deletion`, `should_protect_path`). Burrow quyết định: mỗi junk group có cách xóa cố định thay vì một setting chung. Nhóm tự tạo lại được (App Caches, Browsers, Logs & Saved State, Developer Tools) và nhóm Trash bị **xóa hẳn** để số GB giải phóng là thật; nhóm người dùng có thể tiếc (App Leftovers, Virtualization, Device Backups & Firmware) được **đưa vào Trash** để còn "Put Back". Trước khi xóa, engine kiểm tra lại từng junk item: phải nằm trong `ScanResult` hiện tại (UI chỉ gửi id, không gửi path), tuyệt đối, không `..`/ký tự điều khiển, sau khi phân giải mọi symlink (kể cả thư mục cha) vẫn nằm dưới `$HOME` và ngoài danh sách cấm, và vẫn tồn tại. Kiểm tra hay xóa lỗi thì bỏ qua item kèm lý do, không thử lại, không sudo.

## Considered Options

- **Luôn vào Trash**: an toàn nhất nhưng không giải phóng dung lượng tới khi người dùng dọn Trash, nên con số "freed" sai.
- **Luôn xóa hẳn** (như `mo clean`): không hoàn tác được cho leftover và backup.
- **Setting cho người dùng chọn** (như Mole for Mac): thêm một lựa chọn mà đa số không hiểu hậu quả.

## Consequences

- Màn review ghi rõ nhóm nào "moves to Trash"; kết quả tách "freed" (xóa hẳn) và "moved to Trash".
- Ánh xạ section của Mole sang junk group (kèm cách xóa và mặc định chọn) là bảng do Burrow giữ; section lạ bị bỏ qua và ghi log, có test trên version Mole đã pin để bắt section chưa ánh xạ.
- Burrow không bao giờ ghi vào `~/.config/mole/whitelist` (tạo file này sẽ thay thế whitelist mặc định của Mole).
- Mỗi lần dọn ghi một dòng vào `~/Library/Application Support/Burrow/history.jsonl` để soi lại khi có xóa nhầm.
