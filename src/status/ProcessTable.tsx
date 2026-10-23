import type { ReactNode } from "react";
import { formatBytes } from "../format";
import type { Process } from "../mygo";
import { strings } from "../strings";
import { Label } from "./Card";
import { formatProcessCPU } from "./format";

const text = strings.status.processes;

/** The busiest processes as Mole ranks them by CPU. Read-only: no sorting, no actions. */
export function ProcessTable({ processes }: { processes: readonly Process[] }) {
  return (
    <section className="min-h-process-table shrink-0 grow overflow-hidden rounded-card border border-line bg-surface">
      <table aria-label={text.title} className="w-full table-fixed text-body">
        <thead>
          <tr className="border-line border-b">
            <Heading align="left">{text.name}</Heading>
            <Heading align="right" sorted>
              {text.cpu}
            </Heading>
            <Heading align="right">{text.memory}</Heading>
            <Heading align="right">{text.pid}</Heading>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => (
            <tr key={process.pid} className="border-line border-b last:border-0">
              {/* Cut short in a narrow window; the whole name shows on hover. */}
              <td className="truncate px-4 py-2" title={process.name ?? undefined}>
                {process.name ?? strings.unavailable}
              </td>
              <td className={NUMBER}>{formatProcessCPU(process.cpu)}</td>
              <td className={`${NUMBER} text-ink-muted`}>{formatBytes(process.memoryBytes)}</td>
              <td className={`${NUMBER} text-ink-faint`}>{process.pid}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const NUMBER = "tabular w-28 px-4 py-2 text-right font-mono";

const ALIGN = { left: "text-left", right: "text-right" } as const;

function Heading({ align, sorted, children }: { align: keyof typeof ALIGN; sorted?: boolean; children: ReactNode }) {
  return (
    <th scope="col" aria-sort={sorted ? "descending" : undefined} className={`px-4 py-2 font-normal ${ALIGN[align]}`}>
      <span className="inline-flex text-ink-faint">
        <Label>
          {children}
          {sorted && <span aria-hidden="true">{text.sorted}</span>}
        </Label>
      </span>
    </th>
  );
}
