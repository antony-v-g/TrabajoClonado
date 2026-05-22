type Props = {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
};

export function AdminPageHeader({ title, subtitle, extra }: Props) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900">{title}</h1>
        {subtitle ? (
          <p className="mt-2 text-slate-500 max-w-2xl">{subtitle}</p>
        ) : null}
      </div>
      {extra ? (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {extra}
        </div>
      ) : null}
    </div>
  );
}
