package mole

/*
#cgo LDFLAGS: -framework SystemConfiguration -framework CoreFoundation
#include <SystemConfiguration/SystemConfiguration.h>
#include <mach/mach.h>
#include <net/if.h>

static void primaryInterface(char *name) {
 const CFStringRef keys[] = {CFSTR("State:/Network/Global/IPv4"), CFSTR("State:/Network/Global/IPv6")};
 for (int i=0; i<2; i++) {
  CFDictionaryRef state=SCDynamicStoreCopyValue(NULL, keys[i]);
  if (!state) continue;
  CFStringRef value=CFDictionaryGetValue(state, CFSTR("PrimaryInterface"));
  Boolean found=value && CFStringGetCString(value,name,IFNAMSIZ,kCFStringEncodingUTF8);
  CFRelease(state);
  if (found) return;
 }
}

static int cpuTicks(host_cpu_load_info_t ticks) {
 mach_msg_type_number_t count=HOST_CPU_LOAD_INFO_COUNT;
 mach_port_t host=mach_host_self();
 kern_return_t result=host_statistics(host,HOST_CPU_LOAD_INFO,(host_info_t)ticks,&count);
 mach_port_deallocate(mach_task_self(),host);
 return result==KERN_SUCCESS;
}
*/
import "C"

import (
	"cmp"
	"encoding/binary"
	"log/slog"
	"math"
	"slices"
	"time"
	"unsafe"

	"github.com/caseymrm/go-smc"
	"golang.org/x/net/route"
	"golang.org/x/sys/unix"
)

type systemReadings struct {
	networkFailed bool
	ticks         *C.host_cpu_load_info_data_t
	counters      map[string]ifCounters
	at            time.Time
}
type ifCounters struct{ rx, tx uint64 }

func (r *systemReadings) update(s *StatusSample) {
	var ticks C.host_cpu_load_info_data_t
	if C.cpuTicks(&ticks) != 0 {
		if r.ticks != nil {
			var delta [4]float64
			var total float64
			for i, v := range ticks.cpu_ticks {
				delta[i] = float64(v - r.ticks.cpu_ticks[i])
				total += delta[i]
			}
			if total > 0 {
				s.Details.User = ptrTo(100 * (delta[C.CPU_STATE_USER] + delta[C.CPU_STATE_NICE]) / total)
				s.Details.System = ptrTo(100 * delta[C.CPU_STATE_SYSTEM] / total)
			}
		}
		r.ticks = &ticks
	}
	r.network(s)
	// Keep the package reading when available. Otherwise choose the first
	// readable CPU sensor by key so changing temperatures do not switch sources.
	useSensor := s.Thermal.CPUCelsius == nil
	for key, value := range smc.ReadTemperatures() {
		if !(value > 0) || math.IsInf(value, 0) {
			continue
		}
		s.Details.addSensor(key, &value)
		if useSensor && (s.Details.ThermalSource == "" || key < s.Details.ThermalSource) {
			s.Details.ThermalSource = key
			s.Thermal.CPUCelsius = ptrTo(value)
		}
	}
	slices.SortFunc(s.Details.Sensors, func(a, b Sensor) int { return cmp.Or(cmp.Compare(b.Celsius, a.Celsius), cmp.Compare(a.Name, b.Name)) })
}

func (r *systemReadings) network(s *StatusSample) {
	var name [C.IFNAMSIZ]C.char
	C.primaryInterface(&name[0])
	primary := C.GoString(&name[0])
	s.Network = Network{Interface: nonEmpty(&primary)}
	known := make(map[string]int, len(s.Details.Interfaces))
	for index, n := range s.Details.Interfaces {
		known[*n.Interface] = index
		if *n.Interface == primary {
			s.Network = n
		}
	}
	// Mole omits tunnel and loopback interfaces on some Macs. Fill those
	// from the kernel, retaining Mole's rates wherever a reading exists.
	data, err := route.FetchRIB(unix.AF_UNSPEC, unix.NET_RT_IFLIST2, 0)
	if err != nil {
		if !r.networkFailed {
			slog.Warn("reading network interface counters", "error", err)
		}
		r.networkFailed = true
		return
	}
	r.networkFailed = false
	now := time.Now()
	seconds := now.Sub(r.at).Seconds()
	next := make(map[string]ifCounters)
	for len(data) >= 4 {
		size := int(binary.NativeEndian.Uint16(data))
		if size < 4 || size > len(data) {
			break
		}
		msg := data[:size]
		data = data[size:]
		if msg[3] != unix.RTM_IFINFO2 || size < int(unsafe.Sizeof(unix.IfMsghdr2{})) {
			continue
		}
		h := (*unix.IfMsghdr2)(unsafe.Pointer(&msg[0]))
		if h.Flags&unix.IFF_UP == 0 {
			continue
		}
		var buf [C.IFNAMSIZ]C.char
		if C.if_indextoname(C.uint(h.Index), &buf[0]) == nil {
			continue
		}
		name := C.GoString(&buf[0])
		current := ifCounters{h.Data.Ibytes, h.Data.Obytes}
		n := Network{Interface: &name}
		if old, ok := r.counters[name]; ok && seconds > 0 && seconds < 5 && current.rx >= old.rx && current.tx >= old.tx {
			n.DownloadBytesPerSecond = ptrTo(float64(current.rx-old.rx) / seconds)
			n.UploadBytesPerSecond = ptrTo(float64(current.tx-old.tx) / seconds)
		}
		next[name] = current
		if index, found := known[name]; found {
			m := s.Details.Interfaces[index]
			if m.DownloadBytesPerSecond != nil {
				n.DownloadBytesPerSecond = m.DownloadBytesPerSecond
			}
			if m.UploadBytesPerSecond != nil {
				n.UploadBytesPerSecond = m.UploadBytesPerSecond
			}
			s.Details.Interfaces[index] = n
		} else {
			s.Details.Interfaces = append(s.Details.Interfaces, n)
		}
		if name == primary {
			s.Network = n
		}
	}
	r.at = now
	r.counters = next
}
