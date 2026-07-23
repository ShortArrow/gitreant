import { useEffect, useState } from "react";
import { fetchAbout, type AboutView } from "./api";
import type { MsgKey } from "./i18n";
import { useT } from "./settings";

type Translate = (key: MsgKey, params?: Record<string, string | number>) => string;

/** One labeled row of the info dialog. */
export interface InfoItem {
  label: string;
  value: string;
}

/** The dialog rows, from the SPA's own environment plus the server's
 * /api/about answer (placeholder while it loads or when it fails). */
export function infoItems(t: Translate, about: AboutView | null): InfoItem[] {
  return [
    {
      label: t("infoCliVersion"),
      value: about ? `${about.version} (${about.commit})` : "…",
    },
    {
      label: t("infoSpaVersion"),
      value: `${__SPA_VERSION__} (${__SPA_COMMIT__})`,
    },
    { label: t("infoServer"), value: window.location.origin },
    { label: t("infoBrowser"), value: navigator.userAgent },
    { label: t("infoLanguage"), value: navigator.language },
    {
      label: t("infoViewport"),
      value: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
    },
  ];
}

/** The copy-friendly form: one "label: value" line per row. */
export function formatInfo(items: InfoItem[]): string {
  return items.map((i) => `${i.label}: ${i.value}`).join("\n");
}

/** Modal listing the environment (browser, CLI/SPA versions and commits,
 * server) with a one-click copy of everything, for bug reports. */
export function InfoPanel({
  onClose,
  loadAbout = fetchAbout,
}: {
  onClose: () => void;
  /** Injectable for Storybook; defaults to the real API. */
  loadAbout?: () => Promise<AboutView>;
}) {
  const t = useT();
  const [about, setAbout] = useState<AboutView | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let stale = false;
    loadAbout()
      .then((a) => {
        if (!stale) setAbout(a);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [loadAbout]);

  const items = infoItems(t, about);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="settings-modal"
        data-testid="info-panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h3>{t("infoTitle")}</h3>
          <button
            className="icon-btn"
            title={t("closeInfo")}
            data-testid="info-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <dl className="info-list">
          {items.map((item) => (
            <div className="info-row" key={item.label}>
              <dt>{item.label}</dt>
              <dd data-testid="info-value">{item.value}</dd>
            </div>
          ))}
        </dl>
        <div className="info-actions">
          <button
            type="button"
            className="settings-action"
            data-testid="info-copy-all"
            onClick={() => {
              navigator.clipboard
                ?.writeText(formatInfo(items))
                .then(() => setCopied(true))
                .catch(() => {});
            }}
          >
            {copied ? t("copiedInfo") : t("copyAll")}
          </button>
        </div>
      </div>
    </div>
  );
}
