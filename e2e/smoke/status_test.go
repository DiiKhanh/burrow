//go:build smoke

package smoke

import (
	"reflect"
	"testing"
)

func TestMenuBarRestoresOnlyNetwork(t *testing.T) {
	home := generatedHome(t).Home
	const choices = `const boxes=[...document.querySelectorAll("fieldset input")];return boxes.length===4 && !boxes[0].matches(":disabled") ? boxes.map(b=>b.checked):null;`
	for _, tc := range []struct {
		name string
		want []bool
	}{{"new install", []bool{false, false, false, false}}, {"next launch", []bool{false, false, true, false}}} {
		t.Run(tc.name, func(t *testing.T) {
			p := startDrivenApp(t, shipped, home)
			var got []bool
			p.waitFor("menu bar preferences", loadTimeout, &got, choices)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("enabled = %v, want %v", got, tc.want)
			}
			if tc.name == "new install" {
				var clicked bool
				p.eval(&clicked, `document.querySelectorAll("fieldset input")[2].click();return true;`)
				p.waitFor("network preference saved", loadTimeout, &clicked, `const box=document.querySelectorAll("fieldset input")[2];return box.checked&&!box.matches(":disabled");`)
			}
		})
	}
}
