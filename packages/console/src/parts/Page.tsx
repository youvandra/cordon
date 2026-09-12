import type { ReactNode } from "react";
import { Skeleton } from "cordon-ui";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page__head">
      <div className="page__heading">
        <h1 className="page__title">{title}</h1>
        {subtitle ? <p className="page__sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page__actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  action,
  flush = false,
  className,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={["panel", flush ? "panel--flush" : "", className ?? ""].join(" ").trim()}>
      {title ? (
        <header className="panel__head">
          <h2 className="panel__title">{title}</h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** A thin bar for a share of something. Accent only past 90%, where it is the exception. */
export function Meter({ value }: { value: number }) {
  return (
    <span className="meter" aria-hidden="true">
      <span className="meter__fill" style={{ width: `${value}%` }} data-hot={value >= 90 ? "" : undefined} />
    </span>
  );
}

/** The shape of a page before the chain has answered — never another tree's numbers. */
export function PageSkeleton() {
  return (
    <div className="stack" aria-busy="true">
      <div className="page__head">
        <div className="page__heading">
          <Skeleton width={180} height={26} />
          <Skeleton width={320} height={14} style={{ marginTop: 10 }} />
        </div>
      </div>
      <div className="kpis">
        {[0, 1, 2, 3].map((index) => (
          <div className="panel" key={index}>
            <Skeleton width="50%" height={12} />
            <Skeleton width="70%" height={28} style={{ marginTop: 14 }} />
            <Skeleton width="100%" height={4} style={{ marginTop: 16 }} />
          </div>
        ))}
      </div>
      <div className="panel">
        <Skeleton variant="text" lines={5} />
      </div>
    </div>
  );
}

/** The chain was asked and did not answer. A shorter tree would be a screen that disagrees with the contract. */
export function ReadFailed({ title = "The chain did not answer", why }: { title?: string; why: string }) {
  return (
    <div className="stack">
      <PageHeader title={title} subtitle="Nothing is shown rather than a partial answer that looks complete." />
      <Panel>
        <p className="mono muted breakable">{why}</p>
      </Panel>
    </div>
  );
}
