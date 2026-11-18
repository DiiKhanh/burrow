# Status menu bar measurements

One background watcher serves the window and all enabled items. Opening a memory or network panel adds a short-lived process measurement. Only enabled item IDs are saved. Rates use decimal display units.

| Reading | Source and scope | Unit and unavailable cases |
| --- | --- | --- |
| CPU load and core load | Pinned Mole CPU usage across all logical processors and measured per-core usage | Percent. Estimated per-core readings are omitted. |
| User and system CPU | Differences between successive Mach host CPU tick counts. User includes nice time. | Percent of all CPU time. Needs two readings with elapsed ticks. |
| Top CPU processes | Latest non-stale Mole process ranking | Percent of one core. A process can exceed 100%. Missing or stale lists show unavailable. |
| Memory and pressure | Mole physical memory usage, available and cached memory, and macOS pressure level | Bytes, percent and pressure category. Missing fields remain independent. Cached memory can overlap available memory. |
| Top resident processes | System-wide `ps` process table sorted by RSS, including sleeping processes | KiB converted to bytes. A failed query leaves the ranking unavailable. |
| Network overview | SystemConfiguration global IPv4 primary interface, falling back to IPv6. Only that named interface contributes to the overview. | Bytes/s in each direction. No primary interface gives an unavailable overview. |
| Individual interfaces | Mole named RX/TX rates, converted from MiB/s. Routing interface counters supply missing interfaces or directions, including tunnel devices. | Bytes/s. Kernel counters need two readings with the same interface and an uninterrupted interval. |
| Top applications | Two `nettop` process summaries across all interfaces, divided by measured elapsed seconds. PID paths group helpers under their outer app. Standalone executables use their process name. | Bytes/s, ranked by send plus receive. The cumulative baseline and processes that have exited are excluded. Missing intervals leave the ranking unavailable. |
| Temperature | Mole CPU, GPU and battery temperatures plus readable CPU-cluster SMC keys. The CPU package reading has priority. Otherwise the first readable CPU key in lexical order supplies the overview and history. | °C. Missing CPU readings leave other sensors visible. A source change starts a new history segment. |

## Built-app observations

An Apple M2 MacBook Air returned eight core loads, seven readable CPU SMC keys and a battery temperature on an ordinary user account. A two-thread test process reached 153.6% CPU. A sleeping process holding 384 MiB ranked first by RSS. A controlled loopback download placed curl second by application traffic, receiving 5.4 MB/s. Its traffic was outside the primary Wi-Fi interface.

With the main window closed for two minutes, CPU retained a 60-second window containing 55 readings. Missing seconds remained blank. Escape dismissed the native panel, Open Status restored the closed window to Status, and Command-Q exited with the collector reaped.

| State with the main window minimized | CPU (% of one core) | Resident memory (MiB) | Persistent Mole collectors |
| --- | ---: | ---: | ---: |
| All items off | 0.2 | 87.2 | 0 |
| Network enabled | 1.3 | 109.5 | 1 |
| All four enabled | 1.7 | 111.5 | 1 |
| All four enabled, Network panel open | 2.5 | 117.3 | 1 |

Each row averages five one-second intervals for the app process and its persistent Mole child. WebKit processes and short-lived helpers such as nettop are outside these figures. These observations describe one machine and workload.

The Network panel opened beneath its item beside the built-in display notch and on an external 1920 × 1080 display. All four IDs were present. With a crowded menu bar, macOS hid an item behind the notch. Suspending the fixture collector marked all four visible values stale and resuming it restored live readings.

Sleep gaps and interface/source changes have deterministic watcher coverage. Physical sleep/wake and switching a live VPN still need interactive acceptance.
