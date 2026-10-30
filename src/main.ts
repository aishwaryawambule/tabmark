import "./styles/tokens.css";
import "./styles/app.css";
import { renderMethod } from "./ui/method";
import { renderResults } from "./ui/results";
import { renderRun } from "./ui/run";

// Each page is built once and kept: switching to Results in the middle of a run must
// not throw the run away. A page may return a function to call each time it is shown.
type Page = { title: string; render: (el: HTMLElement) => void | (() => void) };
const pages: Record<string, Page> = {
  run: { title: "Tabmark: how fast does AI run in your browser tab?", render: renderRun },
  results: { title: "Results, Tabmark", render: renderResults },
  method: { title: "Method, Tabmark", render: renderMethod },
};

const app = document.getElementById("app")!;
const mounted = new Map<string, { el: HTMLElement; onShow?: () => void }>();

function route() {
  const asked = location.hash.replace(/^#\/?/, "").split("/")[0];
  const key = asked in pages ? asked : "run";
  let page = mounted.get(key);
  if (!page) {
    const el = document.createElement("div");
    app.append(el);
    const onShow = pages[key].render(el);
    page = { el, onShow: onShow || undefined };
    mounted.set(key, page);
  } else page.onShow?.();
  for (const [k, p] of mounted) p.el.hidden = k !== key;
  document.title = pages[key].title;
  for (const a of document.querySelectorAll<HTMLAnchorElement>("nav a")) {
    if (a.dataset.route === key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
route();
