# Phân phối Burrow `.app` không ký cho bạn bè

Ticket: [#5](https://github.com/DiiKhanh/cleaner-app/issues/5). Ngày nghiên cứu: 2026-10-22. Bối cảnh: bạn bè dùng Mac Apple Silicon, macOS hiện tại (Sequoia 15, Tahoe 26, macOS 27), Burrow build bằng MyGo, không có Apple Developer Program trả phí (không Developer ID, không notarization), phát hành qua GitHub Releases.

## Tóm tắt

- Mọi app tải bằng trình duyệt đều bị gắn `com.apple.quarantine`; lần mở đầu tiên Gatekeeper kiểm tra và chặn app không có Developer ID + notarization. Từ macOS Sequoia, Control-click > Open không còn bỏ qua được Gatekeeper nữa; người nhận phải vào System Settings > Privacy & Security > Open Anyway (nút chỉ hiện khoảng 1 giờ sau lần mở thất bại), rồi nhập mật khẩu đăng nhập. [S1][S2]
- Trên Apple Silicon, mọi executable arm64 bắt buộc phải có chữ ký; ad-hoc là đủ. Go linker tự ad-hoc sign binary darwin/arm64, và MyGo mặc định ad-hoc sign cả bundle, nên không cần chạy `codesign -s -` bằng tay, trừ khi sửa bundle sau khi MyGo ký. [S3][S5][S6]
- Ad-hoc signature không bao giờ qua được Gatekeeper; nó chỉ để app chạy được, không để "được tin cậy". [S3][S6]
- Định dạng: dùng DMG mà `mygo build` tạo sẵn. Zip cũng được nhưng không có lợi gì về Gatekeeper; cả hai đều bị quarantine giống nhau khi tải bằng trình duyệt. [S6][S8]
- Không có cách miễn phí nào làm biến mất cảnh báo Gatekeeper với file tải bằng trình duyệt. Cách giảm ma sát thật sự: (a) hướng dẫn Open Anyway rõ ràng, (b) hoặc tải không qua trình duyệt (`curl`, `gh release download`) để file không bị quarantine, (c) hoặc `xattr -dr com.apple.quarantine`. [S4][S9][S10]
- Rủi ro riêng cho Burrow: ad-hoc signature có designated requirement gắn với cdhash của từng bản build, nên quyền TCC (ví dụ Full Disk Access) có thể phải cấp lại sau mỗi bản cập nhật. Dùng một code signing identity tự ký (self-signed) ổn định sẽ giảm vấn đề này, nhưng vẫn không qua Gatekeeper. [S7]

## 1. Gatekeeper và quarantine chặn thế nào trên macOS hiện tại

### Quarantine

- Chỉ những app opt in mới gắn quarantine cho file chúng tạo ra: key `LSFileQuarantineEnabled` trong Info.plist là "A Boolean value indicating whether the files this app creates are quarantined by default." Trình duyệt (Safari, Chrome) gắn quarantine; công cụ dòng lệnh như `curl` thì không. [S9]
- Kiểm chứng trên máy (macOS 15.7.9, Apple Silicon): file tải bằng `curl -L` chỉ có `com.apple.provenance`, không có `com.apple.quarantine`. Khi giải nén một zip đã bị quarantine bằng `ditto -x -k`, app bên trong cũng mang `com.apple.quarantine` (quarantine lan truyền từ archive xuống nội dung). Thí nghiệm của nghiên cứu này, xem mục "Thí nghiệm".
- Gatekeeper kiểm tra phần mềm "the first time it's opened" và cho phép người dùng override chính sách "unless restricted by a device management service". [S11]

### Gatekeeper với app không ký hoặc chỉ ad-hoc

- App tải về phải "signed by a registered developer and notarized by Apple" thì mới mở bình thường. [S11]
- Notarization đòi hỏi chứng chỉ Developer ID: "Use a 'Developer ID' application ... certificate ... (Don't use a Mac Distribution, ad hoc, Apple Developer, or local development certificate.)" [S8]
- Ad-hoc signature do linker tạo: "given that these signatures do not bear any valid identity, binaries signed this way cannot pass through Gatekeeper." [S3]
- MyGo nói thẳng: "Apps signed ad hoc, the default, run on the Mac that built them, but Gatekeeper blocks them on others." [S6]
- Kiểm chứng: `spctl -a -vv -t exec` trên một `.app` Go ad-hoc signed trả về `rejected`, có hoặc không có quarantine. Nhưng `spctl` chỉ là assessment; thực tế Gatekeeper chỉ can thiệp khi app mang quarantine. Bản build trên máy mình (không quarantine) chạy bình thường. [S12]

### Thay đổi gần đây (Sequoia trở đi)

- Apple Developer News, 2024-08-06, "Updates to runtime protection in macOS Sequoia": "In macOS Sequoia, users will no longer be able to Control-click to override Gatekeeper when opening software that isn't signed correctly or notarized. They'll need to visit System Settings > Privacy & Security to review security information for software before allowing it to run." [S1]
- Mac User Guide (bản macOS 27, mới nhất ở thời điểm 2026-10) vẫn mô tả đúng luồng Privacy & Security > Open Anyway, nút "available for about an hour after you try to open the app", cần "login password", và sau đó "The app is saved as an exception to your security settings". [S2]
- `spctl` man page (macOS 15): "As of MacOS 15.0, operations that modify the rule database or the global state of the assessment subsystem will no longer be supported." `spctl --global-disable` giờ chỉ "Reveal the option to allow applications downloaded from anywhere in the Privacy & Security settings pane", tức không còn tắt Gatekeeper trực tiếp bằng lệnh. Không nên bảo bạn bè tắt Gatekeeper toàn hệ thống. [S12]
- Hệ sinh thái cũng siết theo: Homebrew 5.0.0 (2025-11-12) deprecate `--no-quarantine` vì "Homebrew does not wish to easily provide circumvention to macOS security features", và "will disable all Homebrew/homebrew-cask casks that fail Gatekeeper checks in September 2026". Vì vậy Homebrew cask chính thức không còn là đường phân phối cho app không ký. [S13]

## 2. Ad-hoc signing có bắt buộc trên Apple Silicon không

Có, mọi code native arm64 phải có chữ ký, nhưng ad-hoc là đủ, và toolchain thường đã làm sẵn.

- macOS Big Sur 11.0.1 Universal Apps Release Notes: "New in macOS 11 on Macs with Apple silicon ... the operating system enforces that any executable must be signed before it's allowed to run. There isn't a specific identity requirement for this signature: a simple ad-hoc signature is sufficient." Không áp dụng cho binary x86 chạy qua Rosetta 2. [S3]
- Cùng nguồn: chữ ký link-time "are not bound to the specific machine that was used to build the executable, they can be verified on any other system", nhưng nếu dùng công cụ sửa binary sau khi link (như `strip`, `install_name_tool`) thì "you might need to manually call `codesign(1)`". [S3]
- Go toolchain: `cmd/link` có `NeedCodeSign()` trả về `ctxt.IsDarwin() && ctxt.IsARM64()`, và khi đúng thì gọi `machoCodeSign`, hàm "code-signs Mach-O file fname with an ad-hoc signature" (package `cmd/internal/codesign`: "basic functionalities for ad-hoc code signing of Mach-O files ... uses the same ad-hoc signing algorithm as the Darwin linker"). [S5]
- Kiểm chứng (Go 1.26.0): `codesign -dv` trên binary Go cho `flags=0x20002(adhoc,linker-signed)`, `Identifier=a.out`. Bỏ chữ ký (`codesign --remove-signature`) rồi chạy thì bị kernel giết: `Killed: 9`.
- Lưu ý quan trọng: chữ ký của linker chỉ phủ executable, không phủ bundle. Một `.app` chỉ có binary linker-signed sẽ fail `codesign --verify --strict` với lỗi "code has no resources but signature indicates they must be present". Sau `codesign --force -s - Burrow.app` thì có `Sealed Resources` và "valid on disk". Bundle hỏng chữ ký là nguyên nhân phổ biến của thông báo "is damaged and can't be opened" khi app bị quarantine (Apple DTS chỉ ra hai nguyên nhân thường gặp của lỗi "damaged": notarize sai hoặc ký sai). [S10][S14]
- MyGo xử lý phần này: "mygo build makes an app bundle, signs it, and puts it in a disk image"; với ad-hoc (mặc định) "only code without a signature is signed: Apple silicon runs no unsigned code" cho các helper trong resources. Vậy chỉ cần `codesign -s -` thủ công nếu Burrow sửa bundle sau bước ký của MyGo (ví dụ chèn thêm binary Mole vào sau). Không dùng `--deep` ("don't use `--deep`"). [S6][S10]

## 3. Định dạng nên dùng: zip hay dmg

| | DMG | Zip |
| --- | --- | --- |
| Có sẵn từ MyGo | Có, `mygo build` tạo DMG có cửa sổ kéo app vào Applications [S6] | Phải tự tạo bằng `ditto -c -k --keepParent` [S8] |
| Ký container | Ký được (với Developer ID); không có ý nghĩa khi không có Developer ID [S8] | "You can't sign a zip archive" [S8] |
| Quarantine khi tải bằng trình duyệt | Có | Có, và lan xuống app khi giải nén |
| Trải nghiệm | Kéo vào Applications | Giải nén, tự di chuyển |

Khuyến nghị: dùng DMG mà `mygo build` tạo sẵn (và `mygo build -upload` đẩy lên GitHub Release dạng draft [S6]). Không có lợi ích Gatekeeper nào khi đổi sang zip. Nếu tự đóng zip thì bắt buộc dùng `ditto`, không dùng `zip` thường, để giữ symlink và metadata của bundle. [S8]

Nhắc người nhận kéo app vào `/Applications` trước khi mở: MyGo auto-update yêu cầu "An app must be able to write to where it is installed", ví dụ `/Applications` hoặc `~/Applications`, không chạy từ trong DMG. [S15]

## 4. Người nhận phải làm gì (từng bước)

### Cách A: qua giao diện (khuyến nghị cho đa số)

1. Tải `Burrow-x.y.z-arm64.dmg` từ GitHub Release, mở DMG, kéo Burrow vào Applications.
2. Mở Burrow từ Applications. macOS báo không xác minh được app; bấm Done (không bấm Move to Trash).
3. Mở Apple menu > System Settings > Privacy & Security, cuộn xuống phần Security. [S2]
4. Bấm Open Anyway cạnh dòng nhắc tới Burrow. Nút này chỉ có khoảng 1 giờ sau bước 2; quá giờ thì mở lại app để nút hiện lại. [S2]
5. Nhập mật khẩu đăng nhập, bấm OK. Hộp thoại cảnh báo hiện lại, bấm Open. [S2][S4]
6. Từ đó app được lưu làm exception, mở bằng double-click như bình thường. [S2]

Không còn dùng được: Control-click (hoặc right-click) > Open. [S1]

### Cách B: Terminal (nhanh cho người quen dòng lệnh)

```sh
xattr -dr com.apple.quarantine /Applications/Burrow.app
open /Applications/Burrow.app
```

`xattr -d` xóa attribute, `-r` áp dụng đệ quy cho toàn bộ bundle. [S16] Apple DTS xác nhận người test nội bộ "must bypass Gatekeeper ... they can remove the quarantine extended attribute", đồng thời cảnh báo đây là cách cho phân phối nội bộ, không phải cho số đông. [S10][S14]

### Cách C: tải không qua trình duyệt

Quarantine chỉ do app opt in gắn vào [S9]; Apple DTS gợi ý "transfer the app using a mechanism that doesn't quarantine it (like `scp`)". [S10] Ví dụ với bạn bè có `gh`:

```sh
gh release download vX.Y.Z -R DiiKhanh/cleaner-app -p '*arm64.dmg'
```

(Chưa kiểm chứng trực tiếp việc `gh` không gắn quarantine; `curl` thì đã kiểm chứng ở trên.) Ghi chú: repo hiện là private, nên bạn bè cần quyền truy cập repo hoặc cần một repo public riêng để chứa release thì mới tải được.

## 5. Giảm ma sát mà không trả phí

| Cách | Bỏ được cảnh báo Gatekeeper? | Ghi chú |
| --- | --- | --- |
| Hướng dẫn Open Anyway kèm ảnh chụp trong release notes | Không, nhưng chỉ làm 1 lần | Đường chính thức, an toàn nhất [S2] |
| Tải bằng `curl`/`gh` thay vì trình duyệt | Có (không có quarantine) | Phù hợp nhóm nhỏ biết Terminal [S9][S10] |
| `xattr -dr com.apple.quarantine` | Có | Một lệnh, nhưng là bypass có chủ đích [S10][S16] |
| Auto-update của MyGo | Bản cập nhật tải trong app | Updater kiểm tra chữ ký update bằng public key nhúng trong app ("installed apps accept only updates signed with it") [S15]. Theo [S9], file do app tạo chỉ bị quarantine nếu app opt in, nên bản cập nhật nhiều khả năng không phải qua Open Anyway lại. Chưa kiểm chứng end-to-end. |
| Self-signed code signing identity (Keychain Access > Certificate Assistant) [S17] | Không | Cho designated requirement ổn định giữa các bản build (xem dưới). MyGo nhận `macos.signingIdentity` bất kỳ [S6]; cần thử trước khi dùng. |
| Tắt Gatekeeper (`spctl --global-disable`) | Có, toàn hệ thống | Không khuyến nghị; từ macOS 15 chỉ còn làm lộ tùy chọn trong Settings [S12] |
| Homebrew cask chính thức | Không còn | Cask không qua Gatekeeper bị disable từ 2026-09 [S13] |
| Free Apple ID ("Apple Development" cert) | Không | Notarization chỉ nhận Developer ID [S8] |

### Rủi ro TCC với ad-hoc (quan trọng với Burrow)

Burrow là cleaner nên nhiều khả năng cần Full Disk Access. TN3127: "Ad hoc signed code ... has a DR but it's tied to that specific version of the code ... macOS can't reliably track the identity of the code", "Without a DR, macOS can't track this authorization across versions of your app." [S7] Kiểm chứng: DR của app ad-hoc là `designated => cdhash H"..."`. Hệ quả dự kiến: mỗi bản cập nhật, bạn bè có thể phải cấp lại Full Disk Access. Apple DTS cũng nhắc code ad-hoc "doesn't have a stable identity" khiến keychain liên tục hỏi quyền. [S18] Một identity tự ký dùng cố định qua các bản build cho DR dạng `identifier ... and certificate ...` ổn định, nên là hướng đáng thử nếu điều này gây phiền; đây là suy luận từ [S7], chưa kiểm chứng với TCC.

## Thí nghiệm

Chạy trên macOS 15.7.9 (24G830), Apple Silicon, Go 1.26.0. Script: tạo `Hello.app` tối giản với binary Go arm64.

- Binary Go: `flags=0x20002(adhoc,linker-signed)`.
- `codesign --verify --strict Hello.app` (chỉ linker-signed): "code has no resources but signature indicates they must be present".
- Binary bị bỏ chữ ký: `Killed: 9` (exit 137).
- Sau `codesign --force -s - Hello.app`: `Sealed Resources version=2`, "valid on disk", DR `cdhash H"..."`.
- `spctl -a -vv -t exec`: `rejected`.
- Zip bằng `ditto`, gắn quarantine vào zip, giải nén bằng `ditto -x -k`: app có `com.apple.quarantine`. Sau `xattr -dr com.apple.quarantine`: chỉ còn `com.apple.provenance`.
- File tải bằng `curl -L`: không có `com.apple.quarantine`.

Chưa kiểm chứng: hộp thoại Gatekeeper và Open Anyway thực tế trên máy khác (cần một Mac thứ hai tải bằng trình duyệt).

## Nguồn

- [S1] Apple Developer News, "Updates to runtime protection in macOS Sequoia", 2024-08-06. https://developer.apple.com/news/?id=saqachfa
- [S2] Apple, Mac User Guide (macOS 27), "Open a Mac app from an unknown developer". https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac
- [S3] Apple, "macOS Big Sur 11.0.1 Universal Apps Release Notes", mục Code Signing. https://developer.apple.com/documentation/macos-release-notes/macos-big-sur-11_0_1-universal-apps-release-notes
- [S4] Apple Support, "Safely open apps on your Mac" (102445). https://support.apple.com/en-us/102445
- [S5] Go source: `src/cmd/link/internal/ld/lib.go` (`NeedCodeSign`), `src/cmd/link/internal/ld/macho.go` (`machoCodeSign`), `src/cmd/internal/codesign/codesign.go`. https://go.dev/src/cmd/link/internal/ld/lib.go , https://go.dev/src/cmd/link/internal/ld/macho.go , https://go.dev/src/cmd/internal/codesign/codesign.go
- [S6] MyGo docs, Distribution (macOS: "Signing and notarization", helper executables, Publishing). https://mygo.egoist.dev/docs/distribution
- [S7] Apple, "TN3127: Inside Code Signing: Requirements", mục Designated requirement. https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements
- [S8] Apple, "Packaging Mac software for distribution" và "Notarizing macOS software before distribution". https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution , https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- [S9] Apple, Information Property List, `LSFileQuarantineEnabled`. https://developer.apple.com/documentation/bundleresources/information-property-list/lsfilequarantineenabled
- [S10] Apple Developer Forums, Quinn "The Eskimo!" (Apple DTS), thread 694784 "App not launch on an M1 mac". https://developer.apple.com/forums/thread/694784
- [S11] Apple Platform Security Guide, "Gatekeeper and runtime protection in macOS". https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web
- [S12] `man spctl` (macOS 15.7.9), mục `--global-disable` và DEPRECATED OPTIONS.
- [S13] Homebrew, "Homebrew 5.0.0", 2025-11-12. https://brew.sh/2025/11/12/homebrew-5.0.0/
- [S14] Apple Developer Forums, Quinn "The Eskimo!", thread 692774 "My app is damaged and can't be opened when porting to M1?". https://developer.apple.com/forums/thread/692774
- [S15] MyGo docs, Auto-updates. https://mygo.egoist.dev/docs/updates
- [S16] `man xattr` (macOS 15.7.9), các tùy chọn `-d`, `-r`.
- [S17] Apple, Keychain Access User Guide, "Create self-signed certificates in Keychain Access on Mac". https://support.apple.com/guide/keychain-access/create-self-signed-certificates-kyca8916/mac
- [S18] Apple Developer Forums, Quinn "The Eskimo!", thread 651730 "Clarify restrictions / security as applied to development on Apple Silicon?". https://developer.apple.com/forums/thread/651730
- `man codesign`: "If identity is the single letter "-" (dash), ad-hoc signing is performed. Ad-hoc signing does not use an identity at all, and identifies exactly one instance of code."
