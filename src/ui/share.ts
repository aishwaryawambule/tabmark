// "Add to public results" and "Copy result", shared by both test cards. Sharing shows the
// exact JSON first, then opens a prefilled GitHub issue.

import { issueUrl, validateResult, type Result } from "../core/result";
import { h } from "./dom";

export const REPO = (import.meta.env.VITE_RESULTS_REPO as string | undefined) ?? "";

export function shareActions(result: Result, finished: boolean): HTMLElement[] {
  const canShare = !!REPO && finished && validateResult(result).length === 0;
  const share = h("button", { class: "btn primary", type: "button", disabled: !canShare }, "Add to public results");
  const copy = h("button", { class: "btn outline", type: "button" }, "Copy result");
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2)).catch(() => {});
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy result"), 1600);
  });
  const why = !REPO ? "Sharing opens once this site is published with a results repository." : finished ? "" : "Only runs with a finished test can be shared.";
  share.addEventListener("click", () => {
    share.parentElement!.replaceWith(h("div", { class: "review" },
      h("p", {}, h("b", {}, "This is everything that gets shared. "), "No name, account or IP address; GitHub shows your username on the issue you open."),
      h("pre", {}, JSON.stringify(result, null, 2)),
      h("a", { class: "btn primary block", href: issueUrl(REPO, result), target: "_blank", rel: "noopener" }, "Open GitHub to submit"),
      h("p", { class: "note" }, "A check adds it to the charts within a few minutes.")));
  });
  return [h("div", { class: "row2" }, share, copy), ...(why ? [h("p", { class: "note" }, why)] : [])];
}
