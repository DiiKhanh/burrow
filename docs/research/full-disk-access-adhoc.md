# Full Disk Access cho Burrow ký ad-hoc

Ticket: [Full Disk Access cho Burrow ký ad-hoc](https://github.com/DiiKhanh/cleaner-app/issues/12). Ngày nghiên cứu: 2026-10-22. Phạm vi code: Mole tại commit [`09afc56`](https://github.com/tw93/mole/tree/09afc56042d3fcb6de491f1416767bec5485cad3), đúng version đã dùng để ra quyết định engine. Burrow v1 chạy trên macOS Apple Silicon, phát hành DMG qua GitHub Releases, không có Developer ID và hiện dự kiến ký ad-hoc.

## Kết luận

Quy ước mức chắc chắn trong báo cáo:

- **Fact** là behavior hoặc mô hình được Apple/Mole công bố, hoặc kết quả thí nghiệm code-signing có thể lặp lại.
- **Inference** là suy luận kỹ thuật từ các fact nhưng chưa có contract public của Apple, đặc biệt với responsible code và TCC persistence.
- **Recommendation** là policy sản phẩm đề xuất cho Burrow v1, không phải claim về internals của macOS.

- **Burrow không cần Full Disk Access để chạy, nhưng cần quyền này để Clean đầy đủ và báo đúng một phần Status.** Không có FDA, các cache/log thông thường dưới home vẫn quét được. `~/.Trash` không liệt kê được; các app container và app-group container của developer khác có lớp bảo vệ riêng; Mail và một số kho dữ liệu ứng dụng cũng thuộc nhóm được FDA bao phủ. Danh sách vị trí MAC/TCC chính xác không được Apple công bố và có thể đổi theo bản macOS, nên không được gắn nhãn mọi lỗi quyền là "thiếu FDA". [S1][S2][S3]
- **Các junk group bị ảnh hưởng trực tiếp là Trash và các group có item dưới `~/Library/Containers` hoặc `~/Library/Group Containers`: App Caches, Logs & Saved State, Virtualization, App Leftovers, và Device Backups & Firmware.** App Caches ở đây gộp ba section Mole: `App caches`, `Cloud & Office`, `Apps & utilities`. Nhiều item khác trong cùng group vẫn quét được. Browsers và Developer Tools chủ yếu dùng path thông thường, nhưng không có bảo đảm lâu dài vì Apple không công bố allowlist và đã thêm các lớp MAC mới qua từng release. [S1][S4][S5]
- **`~/Library/Mail` và `~/Library/Application Support/MobileSync/Backup` không phải junk item của Burrow v1.** Mole chỉ báo chúng trong section `Large files`, mà quyết định ở ticket Mô hình an toàn của Clean đã loại khỏi UI. User essentials chỉ có Mail Downloads, gồm một path cũ và một path trong container của Mail. Device Backups & Firmware hiện chỉ dọn firmware `.ipsw`; backup iOS cũng chỉ là gợi ý Large files. [S6][S7][S8]
- **Subprocess không "inherit FDA" như một credential POSIX.** TCC/MAC xác định `responsible code`. Với helper trực tiếp, macOS cố ghi quyết định cho cả app và Apple nói heuristic này thường hoạt động; child cũng inherit App Sandbox của parent. Vì Burrow dùng native Mach-O làm main executable, chạy `mo clean --dry-run` và `status` trực tiếp, không daemonize, thiết kế này có cơ sở tốt. Tuy nhiên `mo` là shell script rồi gọi tiếp `find`, `du`, `ls`, nên phải xác minh end-to-end trên VM sạch. Không được coi đây là bảo đảm tuyệt đối. [S1][S9]
- **Status phần lớn không cần FDA, nhưng collector của Mole đọc `~/.Trash`.** Khi `WalkDir` gặp lỗi, code bỏ lỗi và trả `0`, không phân biệt Trash rỗng với bị TCC chặn. Burrow phải bỏ qua hoặc đánh dấu giá trị Trash là unavailable khi probe quyền thất bại, không hiển thị `0 B` như số đo thật. [S10]
- **Ad-hoc không có identity ổn định qua rebuild.** Designated requirement của mỗi build bám vào `cdhash`; Apple nói macOS không thể reliably track privacy authorization từ version N sang N+1. Cùng một build nguyên byte có identity cũ, nhưng bất kỳ thay đổi code/resource nào làm cdhash đổi đều có thể buộc người dùng cấp lại FDA. [S1][S11]
- **Inference: một self-signed code-signing identity cố định sửa được vấn đề DR về mặt cơ chế, nhưng không phải giải pháp distribution được Apple hỗ trợ.** Fact là Apple nói certificate self-signed dùng được để xác minh designated requirement, cho phép nhận ra hai version đến từ cùng một nguồn, nhưng cùng tài liệu ghi rõ không ship app ký self-signed. Nó không giúp Gatekeeper, không notarize được và Apple không cam kết FDA sẽ persist. Vì vậy có thể dùng làm internal experiment cho nhóm bạn bè, không được coi là guarantee của v1. [S12][S13]
- **Không có API public để hỏi "Burrow đã có FDA chưa?"** Không đọc TCC database, không dùng file hệ thống không liên quan làm canary. Chỉ thử operation mà tính năng thực sự cần khi người dùng bắt đầu Scan, diễn giải kết quả là "protected access unavailable", rồi tiếp tục phần còn lại. [S1][S14]

## 1. Phân biệt các lớp quyền

Một lỗi file access trên macOS có thể đến từ nhiều lớp độc lập:

| Lớp | Phạm vi liên quan Burrow | Dấu hiệu và cách xử lý |
| --- | --- | --- |
| BSD mode và ACL | Mọi path | Thường trả `EACCES` (13). FDA không vượt qua owner/mode/ACL. Burrow chạy cùng user, không sudo, nên skip item và ghi `permission denied`. [S1][S15] |
| App Sandbox | Chỉ khi bundle bật `com.apple.security.app-sandbox` | FDA không vô hiệu App Sandbox. Bản GitHub ngoài App Store không nên bật sandbox nếu muốn scan home rộng. Child process inherit static sandbox của parent. [S1][S9] |
| Files & Folders | Desktop, Documents, Downloads và các vị trí tương tự | Quyền per-user, có thể prompt theo vị trí; FDA subsume quyền này. `_clean_incomplete_downloads` đụng `~/Downloads`, nên App Caches có thể gặp prompt Files & Folders dù không cần FDA cho các cache khác. [S2][S16] |
| Full Disk Access | Mail và dữ liệu app khác, Time Machine, một số system database/settings | Quyền system-wide do user cấp trong System Settings. Không có entitlement/API để app tự cấp. [S2][S9] |
| App container protection | `~/Library/Containers/<bundle-id>` từ macOS 14 | App khác developer có thể kích hoạt prompt theo phiên. FDA tránh prompt riêng này. Ad-hoc không có Team ID ổn định để được coi là cùng developer với các container đích. [S4][S5] |
| App-group container protection | `~/Library/Group Containers/<group-id>` từ macOS 15 | Tương tự app container, áp dụng cả app không sandboxed. FDA tránh prompt riêng này. [S1][S5] |
| Data Vault, SIP và MAC khác | Vị trí Apple bảo vệ riêng | FDA không có nghĩa là mọi file đều truy cập được. Danh sách exact không public và thay đổi theo OS. `EPERM` gợi ý sandbox/MAC/SIP nhưng không chứng minh nguyên nhân cụ thể. [S1][S15] |

Apple DTS nhấn mạnh rằng exact list của MAC không được tài liệu hóa. Vì vậy bảng dưới đây là audit theo các path mà Mole thật sự dùng, không phải một allowlist TCC hoàn chỉnh. [S1]

## 2. Audit từng junk group của Burrow v1

### Tóm tắt

| Junk group | Không FDA vẫn dùng được? | Phần cần quyền rộng hơn |
| --- | --- | --- |
| App Caches | Một phần lớn | App/group containers trong cả App caches, Cloud & Office, Apps & utilities; Downloads là Files & Folders; một số database ứng dụng có thể chịu MAC riêng |
| Browsers | Phần lớn theo các path hiện tại | Không có path Mail; exact MAC list có thể đổi; phải xử lý lỗi theo item |
| Logs & Saved State | Một phần lớn | Mail container; app-group log; system database có thể chịu MAC riêng |
| Trash | Không | `~/.Trash` cần FDA để list và scan |
| Developer Tools | Phần lớn | Không thấy path FDA điển hình trong section; vẫn xử lý POSIX/MAC theo item |
| Virtualization | Một phần lớn | UTM app container |
| App Leftovers | Một phần | Orphaned container stubs dưới `~/Library/Containers`; scan rộng có thể gặp MAC |
| Device Backups & Firmware | Phần lớn firmware | Apple Configurator group containers; iOS backup không phải item v1 |

### App Caches

Junk group này gộp ba section Mole: `App caches`, `Cloud & Office` và `Apps & utilities`. Chúng trộn ba loại path:

- Path thông thường như `~/Library/Caches/*`, `~/Library/Logs`, `~/Library/Saved Application State`, `~/Library/DiagnosticReports` và các cache rõ tên dưới `~/Library/Application Support`. Chúng không mặc nhiên cần FDA, nhưng vẫn chịu BSD/ACL và MAC thay đổi theo OS. [S17]
- `~/Downloads/*.download`, `*.crdownload`, `*.part`, thuộc Files & Folders chứ không phải FDA-specific. FDA subsume quyền này, nhưng một grant Downloads hẹp cũng đủ. [S16][S17]
- Rất nhiều `~/Library/Containers/...` và `~/Library/Group Containers/...`: cache Apple, cache app sandboxed, Handoff clipboard, container của app bên thứ ba. Đây là app/container protection, không nên mô tả đơn giản là POSIX. Trên macOS Sonoma trở lên access có thể prompt; FDA tránh prompt. [S4][S17]

Cloud & Office có container của Word và Excel; Apps & utilities có container của Feishu, WeChat, WeCom, Podcasts và nhiều app bên thứ ba. Vì vậy hai section này làm Burrow App Caches partial khi thiếu FDA, dù các cache tương ứng dưới `~/Library/Caches` vẫn quét được. [S27]

Hệ quả: không khóa cả App Caches nếu thiếu FDA. Scan các path thường; với container, hoặc yêu cầu FDA trước, hoặc skip sau lỗi/prompt refusal và hiện group partial.

### Browsers

Mole chủ yếu quét `~/Library/Caches/<browser>` và các subtree cache rõ tên trong `~/Library/Application Support/<browser>`. Không quét Safari history, cookie database hay `~/Library/Safari`; không quét `~/Library/Mail`. [S18]

Ở macOS hiện tại những path này thường không cần FDA, nhưng Apple không cam kết exact list và lớp MAC có thể đổi. Vì vậy Browsers là "expected without FDA", không phải "guaranteed without FDA". Mọi `EPERM` vẫn phải thành skipped item, không được suy ra toàn group thiếu FDA. [S1]

### Logs & Saved State

Mapping này gộp User essentials trừ Trash và Application Support:

- `~/Library/Caches`, `~/Library/Logs`, Saved Application State và các cache/log rõ tên thường dùng được không FDA. [S6][S19]
- Recent-items database dưới `~/Library/Application Support/com.apple.sharedfilelist` có thể chịu MAC riêng. Không có tài liệu Apple cam kết path này, nên chỉ xử lý theo operation result. [S6][S1]
- Mail Downloads gồm `~/Library/Mail Downloads` và `~/Library/Containers/com.apple.mail/Data/Library/Mail Downloads`. Path thứ hai chắc chắn nằm trong app container protection; source Mole đã có nhánh xử lý TCC refusal. [S6]
- Application Support có một allowlist log trong `~/Library/Group Containers/group.com.apple.contentdelivery`, chịu app-group container protection. [S19]

### Trash

`~/.Trash` là trường hợp rõ nhất. Mole kiểm tra bằng `ls -A` vì `stat` và test readability vẫn có thể thành công khi listing bị chặn; nếu không list được, Mole ghi rõ phải cấp FDA. Máy dev trong ticket cũng đã tái hiện `Permission denied`. [S20]

Burrow nên probe bằng chính thao tác enumerate khi user bắt đầu Scan. Nếu lỗi, khóa riêng junk group Trash với lý do `Full Disk Access required`; không hiển thị `0 B`, và không coi `stat`, `access(2)` hay `FileExists` là preflight hợp lệ.

### Developer Tools

Các target user-level chủ yếu nằm ở dot-cache trong home, `~/Library/Caches`, `~/Library/Developer`, CoreSimulator và Application Support của developer tools. Audit không thấy Mail, Trash, Time Machine hay database FDA điển hình trong section v1. [S21]

Kết luận chỉ là "expected without FDA". POSIX, Files & Folders nếu tool cấu hình cache vào Documents/Desktop, container protection và MAC mới vẫn có thể chặn item cụ thể.

### Virtualization

VMware, Parallels, Lima, Vagrant và nhiều cache khác ở path thường. UTM có thêm `~/Library/Containers/com.utmapp.UTM/...`; Mole cũng báo OrbStack data dưới group container ở phần hint. Container target cần prompt theo phiên hoặc FDA. [S22]

Vì Burrow không hiển thị Large files, OrbStack data chỉ là hint bị loại; target container thực trong group này là UTM cache. Không khóa cả Virtualization khi thiếu FDA.

### App Leftovers

Orphan scan chủ yếu kiểm tra Caches, Logs, Saved Application State, Preferences và Application Support. Mole cố ý không quét Group Containers nói chung, nhưng có bước xóa stub-only dưới `~/Library/Containers` cho allowlist app đã biết. [S23]

Do đó group này có thể vẫn tìm nhiều leftover không FDA, còn orphan container stubs chịu container protection. Vì chức năng generic scan rộng, kết quả phải được coi partial khi có access error.

### Device Backups & Firmware

Tên junk group hiện rộng hơn dữ liệu Mole thực sự trả:

- Section `Device backups & firmware` chỉ dọn `.ipsw` trong `~/Library/iTunes/* Software Updates` và Apple Configurator group containers. Path iTunes thông thường expected không FDA; Configurator group container chịu app-group protection. [S7]
- `~/Library/Application Support/MobileSync/Backup` chỉ xuất hiện trong Large files hint, mà Burrow v1 đã loại. Burrow v1 không scan hoặc xóa iOS backup từ Mole section này. [S8]

Spec nên đổi label v1 thành `Device Firmware` hoặc ghi rõ group này hiện chỉ chứa firmware, để tránh hứa quét backup mà engine không trả.

## 3. `mo clean --dry-run` và `status` có dùng grant của app không?

### Mô hình đúng: responsible code

TCC không cấp một bit FDA rồi kernel copy bit đó sang mọi child. Với MAC prompt từ helper, macOS cố xác định app user-visible chịu trách nhiệm, hiện tên/purpose của app, ghi quyết định cho cả app và hiển thị app trong System Settings. Apple nói heuristic thường hoạt động nhưng có thể đứt nếu child làm việc "odd" như daemonize. [S1]

Burrow nên giữ topology đơn giản:

1. Native Mach-O của Burrow là `CFBundleExecutable`.
2. Burrow dùng `exec.CommandContext`/`posix_spawn` để chạy binary hoặc script nằm trong bundle.
3. Child giữ quan hệ process với Burrow suốt operation, không `open`, không launchd, không double-fork/daemonize.
4. Ký mọi Mach-O nested trước, với identifier riêng, rồi ký outer app sau cùng.

Apple cũng nói child process inherit App Sandbox của parent, kể cả built-in `/bin/sh`, nhưng đây là quy tắc sandbox, không phải chứng minh FDA. [S1]

### `mo clean --dry-run`

`mo` là Bash và tiếp tục gọi `find`, `du`, `ls` cùng các tool hệ thống. Nếu Burrow spawn trực tiếp và script không daemonize, responsible-code chain có khả năng được quy về Burrow. Tuy nhiên Apple cảnh báo scripting khó cho MAC vì system nhìn thấy interpreter, không phân biệt script; đây là lý do cần E2E trên bundle thật. [S1]

Mole đã tự degrade ở một số chỗ:

- Trash bị skip và in warning nếu `ls -A ~/.Trash` thất bại. [S20]
- Mail Downloads skip nếu sizing bị TCC từ chối. [S6]
- Nhiều container path chỉ biến mất khỏi dry-run result khi glob/find không đọc được.

Burrow chỉ parse `clean-list.txt` nên có thể không thấy warning stdout. Adapter phải có probe riêng và trạng thái partial, thay vì suy ra "không có rác" từ việc path bị thiếu trong file.

### `status --watch`

Binary Status là native direct child, nên responsible-code attribution đơn giản hơn shell chain. Hầu hết metric dùng `sysctl`, `vm_stat`, `ps`, `pmset`, `ioreg`, `system_profiler`, `diskutil`, `scutil` và không cần FDA. [S24]

Ngoại lệ là Trash size. `scanTrashSize` chạy `filepath.WalkDir(~/.Trash)`, bỏ mọi error và trả `0`. Không có field `available`; `TrashApprox` chỉ nói timeout. Burrow phải dùng kết quả probe của Clean để quyết định có tin `TrashSize` hay không, hoặc không dùng metric này trong v1. [S10]

## 4. Identity qua rebuild và update

### Ad-hoc

Apple định nghĩa designated requirement là identity mà macOS lưu khi user cấp privacy access. Ad-hoc có DR nhưng DR gắn với đúng version code, nên macOS không thể reliably nhận version mới là cùng app. [S11]

Thí nghiệm local trên macOS 15.7.9, Apple Silicon:

1. Tạo hai `Burrow.app` có cùng `CFBundleIdentifier=com.example.Burrow`, nhưng executable khác nhau.
2. Ký cả hai bằng `codesign --sign -`.
3. `codesign --display --requirements -` trả DR dạng `cdhash` và hai build có hash khác nhau.

```text
v1: designated => cdhash H"3867c37398279b74846e99454da5801d5122e819" or ...
v2: designated => cdhash H"24e396daeec69d91bb5abb6a4df3dd958df8c4b0" or ...
```

`codesign -dv` xác nhận cả hai có `Identifier=com.example.Burrow`, `Signature=adhoc`, `TeamIdentifier=not set`. Cùng bundle identifier không cứu được identity ad-hoc. Kết luận an toàn là **grant không bền qua changed build**, không phải "chắc chắn mất trên mọi máy" vì behavior TCC cụ thể không phải API public. [S11]

Kiểm tra thêm bằng `codesign --verify --test-requirement '<DR của v1>'`: v1 pass, v2 fail dù bundle identifier giống nhau. Thí nghiệm này chứng minh identity-level incompatibility, không tự nó sửa hay đọc TCC state.

### Self-signed ổn định về DR, không phải distribution identity được hỗ trợ

Apple Code Signing Guide nói self-signed certificate không được OS công nhận cho mục đích nào ngoài validate designated requirement; nhờ đó user có thể xác nhận hai version đến từ cùng nguồn. TN3127 giải thích DR mặc định kết hợp signer và code-signing identifier. Vì vậy cùng certificate + cùng identifier tạo identity bền qua code change ở lớp DR. Tuy nhiên Apple ghi rõ `Do not ship apps signed by self-signed certificates`, nên đây là workaround cho internal testing, không phải replacement được hỗ trợ cho Developer ID. [S11][S12]

Điều kiện vận hành:

- tạo một identity `Self Signed Root`, loại `Code Signing`, validity dài;
- backup private key an toàn, không commit vào repo, không phát cho người nhận;
- cố định `CFBundleIdentifier` và signing identifier;
- ký mọi Mach-O nested bằng identity này, với identifier riêng, rồi ký outer `Burrow.app` sau cùng;
- không sửa bundle sau khi ký;
- dùng identity này cho mọi GitHub release, không vô tình quay về `-`;
- kiểm tra DR của hai release liên tiếp trong CI/release checklist bằng `codesign -d -r-` và test requirement cũ với build mới.

Giới hạn:

- Gatekeeper vẫn chặn, vì non-Apple/self-signed không qua Gatekeeper và không notarize được. Luồng Open Anyway của research phân phối cũ không đổi. [S13][S25]
- TCC/FDA implementation không có contract public nói mọi self-signed update chắc chắn giữ grant. DR model cho cơ sở mạnh, nhưng release đầu phải test trên VM sạch: grant FDA cho v1, thay bằng v2 cùng path, relaunch và scan Trash/container.
- Nếu identity mất, hết hạn hoặc đổi, grant continuity mất. Khi đó cần identity mới và user cấp lại.

Kết luận cho câu hỏi "self-signed có reliable không": **reliable để tạo stable DR nếu quy trình ký giữ nguyên, chưa đủ evidence để gọi là reliable FDA/distribution solution**. Developer ID là distribution identity Apple hỗ trợ; destination hiện loại chi phí Apple Developer Program, nên Burrow v1 phải chấp nhận một trong hai nhược điểm: ad-hoc và hướng dẫn cấp lại sau update, hoặc self-signed như internal workaround đã kiểm thử nhưng không được Apple khuyến nghị ship.

## 5. Detection an toàn

Apple DTS nói không có cách official để "confirm app has FDA". TCC database chỉ lưu choices, không phản ánh đầy đủ effective policy, nhất là khi có MDM override. TCC cũng không có API surface public. [S1][S14]

Không làm:

- không query `~/Library/Application Support/com.apple.TCC/TCC.db` hay database system;
- không dựa vào việc Burrow có trong UI Full Disk Access;
- không dùng `stat`, `access(2)` hoặc `FileManager.isReadableFile` trên `.Trash`, vì Mole xác nhận chúng có thể thành công khi enumerate vẫn bị chặn;
- không probe Mail/TCC database chỉ để đo FDA;
- không gọi `tccutil reset`.

Làm:

1. Chỉ sau khi user bấm Scan, thử enumerate chính `~/.Trash`, vì đây là operation feature cần thực hiện.
2. Success kể cả directory empty nghĩa là operation này hiện dùng được. Failure nghĩa là `protected access unavailable`, không chứng minh duy nhất FDA off.
3. Nếu failure là `EPERM`/`EACCES`, lock Trash, skip known app/group-container targets trong lần Scan đó để tránh chuỗi prompt bất ngờ, tiếp tục các path thường.
4. Mọi operation thật vẫn bắt lỗi riêng. FDA có mặt không bảo đảm POSIX/ACL/SIP/Data Vault cho mọi path.
5. Sau khi user relaunch và Scan lại, probe lại từ đầu. Không cache grant lâu dài qua process/update.

Cách này không đọc nội dung file. Enumerate Trash có thể nhìn thấy tên một item trong process, nên không có preflight hoàn toàn "không đụng dữ liệu". Apple chỉ cung cấp lựa chọn test đúng resource hoặc không test. Burrow nên minh bạch rằng Scan sắp xem tên/path junk để tính dung lượng. [S14]

## 6. UX và deep link

### Luồng khuyến nghị trên macOS 13 trở lên

1. Không chặn app hoặc Status ở first launch.
2. Ở màn Clean trước Scan, giải thích ngắn: `Full Disk Access lets Burrow include Trash, Mail attachments, and caches stored inside other apps. Burrow can still scan common caches without it.`
3. Cho hai action: `Open Full Disk Access` và `Scan without Full Disk Access`.
4. Thử URL `x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles` trên macOS 13+. Apple DTS đã nêu URL này và URL cũ `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles` cho macOS 12 trở xuống, nhưng Apple không tài liệu hóa scheme này như API public ổn định. Vì vậy đây chỉ là best-effort convenience, không phải supported contract. Nếu mở sai pane hoặc thất bại, mở Privacy & Security chung và hiện đường dẫn thủ công `System Settings > Privacy & Security > Full Disk Access`. [S26]
5. Hướng dẫn user tìm hoặc thêm Burrow, bật toggle, xác thực nếu macOS yêu cầu, quit Burrow hoàn toàn và mở lại. Apple Support mô tả app chỉ được user thêm/bật trong System Settings; app không tự cấp được. [S2][S15]
6. Sau relaunch, user bấm Scan lại. Nếu operation vẫn fail, hiện `Protected access is still unavailable` cùng action mở Settings, không loop prompt.

Trạng thái UI khi thiếu quyền:

- Trash: locked group, `Full Disk Access required`.
- Group có cả path thường và protected: vẫn hiện item tìm được, thêm badge `Partial scan` và dòng `Some app containers were skipped`.
- Item operation fail: skipped item với `permission denied` hoặc `protected`, đúng glossary/ADR.
- Status Trash size: `Unavailable`, không phải `0 B`.
- Không nói FDA sẽ vượt qua mọi permission hoặc cho Burrow "all root access". Burrow vẫn chạy user-level, không sudo.

## 7. Quyết định cho Burrow v1

1. **Recommendation: khuyến nghị FDA, không hard requirement.** Clean vẫn chạy partial; Status vẫn hoạt động trừ Trash size.
2. **Recommendation: với constraint không có Developer ID, v1 không được hứa giữ FDA qua update.** Đường ít giả định nhất là tiếp tục ad-hoc và hướng dẫn cấp lại sau mỗi changed build. Stable self-signed chỉ là internal experiment để giảm ma sát; nếu chọn nó, release note phải nói rõ non-Apple signing và CI/release checklist phải kiểm DR cùng E2E update. FDA persistence của self-signed là validation gate, không phải tiền đề để ship v1.
3. **Cấp quyền sau khi kéo app vào `/Applications`**, rồi mọi update thay bundle tại cùng path. Với ad-hoc, dự kiến phải cấp lại sau changed build; với self-signed, có cơ sở DR để giữ grant nhưng vẫn phải test release-to-release.
4. **Thêm access probe ở đầu Scan** và trạng thái partial theo group. Không đọc TCC DB.
5. **Không tin `status.TrashSize` khi protected access unavailable.** Các metric khác tiếp tục bình thường.
6. **E2E bắt buộc trước release**, trên VM/snapshot sạch, cho cả ad-hoc control và self-signed candidate:
   - v1 không FDA: Trash locked, ordinary cache vẫn hiện, không prompt storm;
   - bật FDA qua Settings, relaunch: Trash và container scan qua direct `mo` child;
   - chạy `status --watch`: Trash không còn false zero;
   - thay v1 bằng v2 cùng self-signed identity: access vẫn hoạt động;
   - thay bằng v2 ad-hoc: ghi nhận behavior, nhưng không dựa vào behavior đó như contract;
   - revoke trong UI thủ công và relaunch: app degrade sạch, không crash hoặc xóa nhầm.

Không chạy E2E TCC trong research này vì máy hiện tại không có VM snapshot dành riêng; grant/revoke hoặc đọc các directory protected thật sẽ đổi privacy state hay đụng dữ liệu user. Research chỉ chạy thí nghiệm code-signing trong `/private/tmp`, không gọi `tccutil` và không thay TCC grant.

## Nguồn

- [S1] Apple Developer Forums, Quinn "The Eskimo!", [On File System Permissions](https://developer.apple.com/forums/thread/678819). Phân biệt BSD/ACL/App Sandbox/MAC, exact MAC locations không public, child sandbox inheritance, stable signing identity, responsible code, TCC không có API surface.
- [S2] Apple Support, [Change Privacy & Security settings on Mac](https://support.apple.com/guide/mac-help/change-privacy-security-settings-on-mac-mchl211c911f/mac). Mô tả Files & Folders và Full Disk Access.
- [S3] Apple Platform Security, [Protecting app access to user data](https://support.apple.com/guide/security/protecting-app-access-to-user-data-secc01781f46/web). Data Vault và privacy protection.
- [S4] Apple Developer, WWDC23, [What’s new in privacy](https://developer.apple.com/videos/play/wwdc2023/10053/?time=1530). App container access từ developer khác prompt; FDA tránh prompt.
- [S5] Apple Developer Documentation, [Protecting local app data using containers on macOS](https://developer.apple.com/documentation/xcode/protecting-local-app-data-using-containers). App data và app-group container protection.
- [S6] Mole `09afc56`, [`clean_user_essentials` và `_clean_mail_downloads`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L248-L489).
- [S7] Mole `09afc56`, [`clean_cached_device_firmware`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L2787-L2885).
- [S8] Mole `09afc56`, [Large files paths](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L3077-L3088) và [iOS backup hint](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L3465-L3478).
- [S9] Apple Developer Forums, [Granting full-disk access to my sandboxed mac app](https://developer.apple.com/forums/thread/124895). FDA, Files & Folders và sandbox là lớp riêng; FDA subsume Files & Folders.
- [S10] Mole `09afc56`, [`scanTrashSize`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics_disk.go#L563-L611).
- [S11] Apple Developer Documentation, [TN3127: Inside Code Signing: Requirements](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements). DR, code identity và ad-hoc version-specific.
- [S12] Apple Code Signing Guide, [Code Signing Tasks](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html). Self-signed identity dùng để validate DR giữa các version, nhưng Apple ghi rõ không ship app ký self-signed.
- [S13] Apple Developer Documentation, [TN3161: Inside Code Signing: Certificates](https://developer.apple.com/documentation/technotes/tn3161-inside-code-signing-certificates). macOS chạy non-Apple signatures nhưng Gatekeeper chặn.
- [S14] Apple Developer Forums, Apple DTS, [Full Disk access permission showed not correctly on some macOS](https://developer.apple.com/forums/thread/835851). Không có official FDA confirmation API; test resource thật cần dùng.
- [S15] Apple Developer Documentation, [Accessing files from the macOS App Sandbox](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox). User phải tự cấp FDA; POSIX/ACL/SIP vẫn độc lập.
- [S16] Apple Support, [Control access to files and folders on Mac](https://support.apple.com/guide/mac-help/control-access-to-files-and-folders-on-mac-mchld5a35146/mac). Desktop, Documents, Downloads thuộc Files & Folders.
- [S17] Mole `09afc56`, [`clean_app_caches`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L1150-L1270) và [`clean_group_container_caches`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L1425-L1622).
- [S18] Mole `09afc56`, [`clean_browsers`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L1958-L2190).
- [S19] Mole `09afc56`, [`clean_application_support_logs`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L2474-L2734).
- [S20] Mole `09afc56`, [`clean_trash`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L40-L133).
- [S21] Mole `09afc56`, [`clean_developer_tools`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/dev.sh#L5890-L5997).
- [S22] Mole `09afc56`, [`clean_virtualization_tools`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L2274-L2400).
- [S23] Mole `09afc56`, [orphan resource allowlist](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/apps.sh#L788-L795) và [`clean_orphaned_container_stubs`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/apps.sh#L2004-L2070).
- [S24] Mole `09afc56`, [`runCmd`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status/metrics.go#L716-L725) và Status collectors trong [`cmd/status`](https://github.com/tw93/mole/tree/09afc56042d3fcb6de491f1416767bec5485cad3/cmd/status).
- [S25] MyGo Documentation, [Distribution](https://mygo.egoist.dev/docs/distribution). MyGo mặc định ký ad-hoc và cho cấu hình signing identity.
- [S26] Apple Developer Forums, Apple DTS, [Signing a daemon with the Endpoint Security entitlement](https://developer.apple.com/forums/thread/791996). Apple DTS nêu URL mở pane FDA mới cho macOS 13+ và URL cũ tới macOS 12; đây không phải tài liệu API public cam kết URL ổn định.
- [S27] Mole `09afc56`, [Cloud & Office dispatcher](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/bin/clean.sh#L2073-L2090), [Office containers](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/user.sh#L2246-L2272) và [`clean_user_gui_applications`](https://github.com/tw93/mole/blob/09afc56042d3fcb6de491f1416767bec5485cad3/lib/clean/app_caches.sh#L1984-L2010).
