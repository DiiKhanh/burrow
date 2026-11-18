import { useEffect, useState } from "react";
import { Status } from "../mygo";
import { strings } from "../strings";

const text = strings.status.menu;
const metrics = ["cpu", "memory", "network", "thermal"] as const;
export type MetricKey = (typeof metrics)[number];
export function isMetric(key: string | null): key is MetricKey {
  return metrics.some((value) => value === key);
}

export function MenuPreferences() {
  const [items, setItems] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    Status.enabled().then(
      (next) => {
        if (mounted) setItems(next ?? []);
      },
      () => {
        if (mounted) setFailed(true);
      },
    );
    return () => {
      mounted = false;
    };
  }, []);
  async function toggle(key: MetricKey, on: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      await Status.setEnabled(key, on);
      setItems((previous) => (on ? [...(previous ?? []), key] : (previous ?? []).filter((k) => k !== key)));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-line px-4 py-3 text-body"
      disabled={busy || items === null}
    >
      <legend className="px-1 font-semibold">{text.title}</legend>
      {metrics.map((key) => (
        <label key={key} className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={items?.includes(key) ?? false}
            onChange={(e) => void toggle(key, e.currentTarget.checked)}
          />
          {text.labels[key]}
        </label>
      ))}
      {failed && <p role="alert">{text.settingsError}</p>}
    </fieldset>
  );
}
