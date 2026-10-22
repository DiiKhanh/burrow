import type { Tab } from "../shared/Shell";
import type { CleanFlow } from "../shared/useCleanFlow";
import type { StatusState } from "../mock/status";

export type VariantProps = { tab: Tab; setTab: (t: Tab) => void; flow: CleanFlow; status: StatusState };
