const fs = require('fs');

const fileContent = fs.readFileSync('src/components/overview/OverviewView.tsx', 'utf8');
const lines = fileContent.split('\n');

// Find index where return begins around line 206
let cutIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('return (') && i > 190) {
    cutIndex = i;
    break;
  }
}

if (cutIndex === -1) {
  console.error('Could not find cut point');
  process.exit(1);
}

const headerPart = lines.slice(0, cutIndex).join('\n');

const newRenderBody = `  const maxChartValue = useMemo(() => {
    return Math.max(...displayedMonths.map((d) => d.revenue), targetMonthly, 10000);
  }, [displayedMonths, targetMonthly]);

  const hasWonRevenue = totalPeriodRevenue > 0;

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header: Title left, Stats in ONE row beside it */}
      <HeaderReveal
        title="Sales Overview"
        tiles={[
          {
            label: 'Won this month',
            numericValue: wonThisMonth,
            prefix: currency,
            badge: quotaAttainment > 0 ? \`\${formatPercent(quotaAttainment)} goal\` : undefined,
          },
          {
            label: 'Open pipeline',
            numericValue: openPipelineValue,
            prefix: currency,
            badge: \`\${openLeadsCount} \${openLeadsCount === 1 ? 'deal' : 'deals'}\`,
          },
          {
            label: 'Win rate, closed deals',
            numericValue: winRate,
            suffix: '%',
          },
        ]}
      />

      {/* Row 1: 2-Column Grid (Left: Revenue Card 1.4fr, Right: Hot Deals Card 1fr) */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 items-stretch">
        {/* Left: Revenue Card (Radius 40px, Padding 24px 28px) */}
        <div className="card rounded-[40px] p-[24px_28px] min-w-0 flex flex-col justify-between" data-lift>
          <div>
            {/* Top row: Title + Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="min-w-0">
                <h2 className="text-[18px] font-medium text-[var(--text)] tracking-normal">
                  Revenue
                </h2>
                <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
                  <span className="text-[36px] font-medium text-[var(--text)] font-tabular leading-none">
                    {formatCurrency(totalPeriodRevenue, currency)}
                  </span>
                  <span className="text-[14px] text-[var(--muted)] font-normal">
                    closed in {revenuePeriod === '12M' ? '12' : '6'} months • <strong className="text-[var(--text)] font-medium">{monthsAtTargetCount} of {displayedMonths.length}</strong> months on target
                  </span>
                </div>
              </div>

              {/* Controls top-right: 6M/12M sliding pill, 44px circular ⋯, 44px circular ↗ */}
              <div className="flex items-center gap-2.5 shrink-0">
                <SlidingTabs
                  options={[
                    { id: '6M', label: '6M' },
                    { id: '12M', label: '12M' },
                  ]}
                  value={revenuePeriod}
                  onChange={(val) => setRevenuePeriod(val as '6M' | '12M')}
                />

                <button
                  type="button"
                  className="w-[44px] h-[44px] rounded-full border border-[var(--rim)] bg-[var(--glass-2)] hover:bg-[var(--solid)] text-[var(--text)] grid place-items-center cursor-pointer transition-all shadow-xs"
                  title="More options"
                >
                  <MoreHorizontal className="w-4 h-4 text-[var(--muted)]" />
                </button>

                <button
                  type="button"
                  onClick={onNavigateToPipeline}
                  className="w-[44px] h-[44px] rounded-full border border-[var(--rim)] bg-[var(--glass-2)] hover:bg-[var(--solid)] text-[var(--text)] grid place-items-center cursor-pointer transition-all shadow-xs"
                  title="Go to Pipeline"
                >
                  <ArrowUpRight className="w-4 h-4 text-[var(--text)]" />
                </button>
              </div>
            </div>

            {/* Legend Row */}
            <div className="flex items-center gap-6 text-[14px] text-[var(--muted)] mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--tomato)]" />
                <span className="font-normal text-[var(--text)]">Won revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 border-b-2 border-dashed border-[var(--muted)]" />
                <span>Monthly target {formatCurrency(targetMonthly, currency, { compact: true })}</span>
              </div>
            </div>
          </div>

          {/* Chart Area ~250px high with dashed horizontal gridlines and y-axis labels ($0 / mid / max) */}
          <div className="relative w-full h-[250px] pt-4 select-none flex flex-col justify-between">
            {/* Target pill only when target > 0 and has revenue */}
            {hasWonRevenue && targetMonthly > 0 && (
              <div
                className="absolute right-2 text-[10px] font-semibold text-[var(--muted)] bg-[var(--solid)] px-2 py-0.5 rounded-full border border-[var(--rim)] z-1"
                style={{ top: \`\${Math.max(10, Math.min(85, (chartCoordinates.targetY / 200) * 100))}%\` }}
              >
                Target {formatCurrency(targetMonthly, currency, { compact: true })}
              </div>
            )}

            {/* Empty state message centered */}
            {!hasWonRevenue && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[15px] text-[var(--muted)] font-normal z-2">
                No won revenue yet. Closed deals will appear here.
              </div>
            )}

            {/* SVG area and gridlines */}
            <div className="relative w-full flex-1">
              {/* Y-axis labels */}
              <div className="absolute left-0 inset-y-0 flex flex-col justify-between text-[11px] text-[var(--muted)] font-tabular pointer-events-none pb-1">
                <span>{formatCurrency(maxChartValue, currency, { compact: true })}</span>
                <span>{formatCurrency(Math.round(maxChartValue / 2), currency, { compact: true })}</span>
                <span>$0</span>
              </div>

              <svg className="w-full h-full pl-10 pr-2 overflow-visible" viewBox="0 0 1000 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C8431F" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#C8431F" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Dashed Horizontal Gridlines (Top, Mid, Bottom) */}
                <line x1="0" y1="10" x2="1000" y2="10" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="0" y1="100" x2="1000" y2="100" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="0" y1="190" x2="1000" y2="190" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="4 4" />

                {/* Target dashed horizontal line */}
                {targetMonthly > 0 && (
                  <line
                    x1="0"
                    y1={chartCoordinates.targetY}
                    x2="1000"
                    y2={chartCoordinates.targetY}
                    stroke="var(--muted)"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.6"
                  />
                )}

                {/* Gradient Area & Smooth Line (only when hasWonRevenue) */}
                {hasWonRevenue && chartCoordinates.areaPath && (
                  <path d={chartCoordinates.areaPath} fill="url(#revenueGradient)" />
                )}
                {hasWonRevenue && chartCoordinates.linePath && (
                  <path
                    d={chartCoordinates.linePath}
                    fill="none"
                    stroke="#C8431F"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </div>

            {/* Month labels along bottom */}
            <div className="flex justify-between text-[13px] text-[var(--muted)] pt-3 border-t border-[var(--rim)] pl-10">
              {displayedMonths.map((m, idx) => (
                <span
                  key={\`\${m.month}-\${m.year}\`}
                  onMouseEnter={() => setHoveredMonth(idx)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  className={\`cursor-pointer transition-colors px-1 rounded-md \${
                    hoveredMonth === idx ? 'text-[var(--tomato)] font-medium bg-[var(--tomato)]/10' : 'hover:text-[var(--text)]'
                  }\`}
                >
                  {m.month}
                </span>
              ))}
            </div>

            {/* Hover popup tooltip if hovering month */}
            {hoveredMonth !== null && displayedMonths[hoveredMonth] && hasWonRevenue && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-[var(--ink)] text-white text-xs px-3.5 py-2 rounded-xl shadow-lg pointer-events-none z-10 whitespace-nowrap animate-in fade-in-50">
                <span className="font-semibold">{displayedMonths[hoveredMonth].month}:</span>{' '}
                <span className="font-tabular font-bold">{formatCurrency(displayedMonths[hoveredMonth].revenue, currency)}</span> won
              </div>
            )}
          </div>
        </div>

        {/* Right: Hot Deals Card (Radius 40px, Padding 24px 28px) */}
        <div className="card rounded-[40px] p-[24px_28px] min-w-0 flex flex-col justify-between" data-lift>
          <div>
            {/* Header: Title "Hot deals" with muted "by weighted value" + circular + and ↗ */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-[18px] font-medium text-[var(--text)] tracking-normal">
                  Hot deals
                </h2>
                <span className="text-[14px] text-[var(--muted)] font-normal">
                  by weighted value
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenNewDeal}
                  className="w-[44px] h-[44px] rounded-full border border-[var(--rim)] bg-[var(--glass-2)] hover:bg-[var(--solid)] text-[var(--text)] grid place-items-center cursor-pointer transition-all shadow-xs"
                  title="Add new deal"
                >
                  <Plus className="w-4 h-4 text-[var(--text)]" />
                </button>
                <button
                  type="button"
                  onClick={onNavigateToPipeline}
                  className="w-[44px] h-[44px] rounded-full border border-[var(--rim)] bg-[var(--glass-2)] hover:bg-[var(--solid)] text-[var(--text)] grid place-items-center cursor-pointer transition-all shadow-xs"
                  title="View complete pipeline"
                >
                  <ArrowUpRight className="w-4 h-4 text-[var(--text)]" />
                </button>
              </div>
            </div>

            {/* 2-Column Grid of Black (#17191A) Deal Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {hotDeals.slice(0, 4).map((deal) => (
                <div
                  key={deal.id}
                  onClick={() => deal.rawLead && onSelectLead(deal.rawLead)}
                  className="bg-[#17191A] text-white rounded-[32px] p-[18px_20px] min-h-[190px] flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl relative"
                >
                  {/* Top row: close date + circular ⋯ */}
                  <div className="flex items-center justify-between text-xs text-white/85">
                    <span className="text-[14px] font-normal truncate">{deal.closeDate}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (deal.rawLead) onSelectLead(deal.rawLead);
                      }}
                      className="w-10 h-10 rounded-full border border-white/20 bg-transparent grid place-items-center text-white/80 hover:bg-white/10 transition-colors"
                      title="Deal actions"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Middle: Title 22px/500 (max 2 lines) + Company 15px/80% */}
                  <div className="my-2">
                    <h3 className="text-[22px] font-medium leading-[1.15] text-white line-clamp-2">
                      {deal.title}
                    </h3>
                    <p className="text-[15px] font-normal text-white/80 mt-1 truncate">
                      {deal.company}
                    </p>
                  </div>

                  {/* Bottom: Amount 22px/500, Stage · Prob, Avatar 28px */}
                  <div className="flex items-end justify-between pt-2">
                    <div>
                      <span className="text-[22px] font-medium text-white tabular-nums leading-none">
                        {formatCurrency(deal.value, currency)}
                      </span>
                      <p className="text-[14px] text-white/80 font-normal mt-1">
                        {deal.stage}
                      </p>
                    </div>

                    {/* Avatar bottom-right: 28px circle */}
                    <div
                      className="w-[28px] h-[28px] rounded-full bg-white/20 text-white grid place-items-center text-[11px] font-medium shrink-0"
                      title={deal.company}
                    >
                      {deal.initial}
                    </div>
                  </div>
                </div>
              ))}

              {hotDeals.length === 0 && (
                <div className="col-span-full py-16 flex flex-col items-center justify-center text-center text-[14px] text-[var(--muted)] bg-[var(--solid)]/50 rounded-[32px] border border-dashed border-[var(--rim)] gap-2">
                  <p className="font-medium text-[var(--text)] text-[16px]">No active deals yet</p>
                  <p className="text-[14px] text-[var(--muted)]">Add your first lead or import from Google Sheets.</p>
                  <button
                    type="button"
                    onClick={onOpenNewDeal}
                    className="h-10 px-5 rounded-full bg-[var(--pill)] text-[var(--on-pill)] text-sm font-medium mt-2 inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    Add your first lead
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Second row of cards reusing the same 2-column grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 items-stretch">
        {/* Left: Today's Tasks Focus Card */}
        <div className="min-w-0">
          <TodayTasksSection
            workspace={workspace}
            leads={leads}
            onOpenLead={onSelectLead}
          />
        </div>

        {/* Right: AI Sales Manager Briefing Card */}
        <div className="min-w-0">
          <AiBriefingCard
            workspace={workspace}
            leads={leads}
            onOpenLead={onSelectLead}
          />
        </div>
      </div>

      {/* Row 3: Active Pipeline Distribution & Monthly Quota */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Monthly Quota Realization */}
        <div className="card bg-[var(--pine)] text-white rounded-[40px] p-[24px_28px] shadow-md flex flex-col justify-between border-none">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium text-white/90">Monthly quota realization</span>
            <span className="badge badge--pine bg-white/20 text-white border-none text-[11px] font-medium px-2 py-0.5 rounded-full">
              Live
            </span>
          </div>

          {/* Circular Gauge */}
          <div className="flex flex-col items-center justify-center my-4 relative">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="#F2C94C"
                  strokeWidth="8"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 * (1 - Math.min(quotaAttainment, 100) / 100)}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-medium tracking-tight text-white font-tabular">
                  {formatPercent(quotaAttainment)}
                </span>
                <span className="text-[12px] text-white/80 font-normal mt-0.5">realized</span>
              </div>
            </div>
          </div>

          <div className="text-[14px] text-white/85 text-center font-normal">
            Goal: <span className="font-tabular font-medium">{formatCurrency(targetMonthly, currency)}</span> / mo • <span className="font-tabular font-medium">{formatCurrency(wonThisMonth, currency)}</span> won
          </div>
        </div>

        {/* Right: Active Pipeline Distribution */}
        <div className="lg:col-span-2 card rounded-[40px] p-[24px_28px] flex flex-col justify-between" data-lift>
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-[15px] font-medium text-[var(--muted)]">Active pipeline distribution</span>
              <p className="text-[14px] text-[var(--muted)] mt-0.5">Volume and deal valuation across active stages</p>
            </div>
            <MagneticButton
              onClick={onNavigateToPipeline}
              className="btn btn--subtle btn--icon"
            >
              <ArrowUpRight className="w-4 h-4 text-[var(--text)]" />
            </MagneticButton>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-[26px] font-medium text-[var(--text)] font-tabular">
                {formatCurrency(openPipelineValue, currency)}
              </span>
              <span className="text-[14px] text-[var(--muted)] font-normal">open across <strong className="text-[var(--text)] font-medium">{openLeadsCount}</strong> {openLeadsCount === 1 ? 'deal' : 'deals'}</span>
            </div>

            {/* Segmented Bar */}
            <div className="h-9 w-full flex rounded-xl overflow-hidden gap-1 p-1 bg-[var(--solid)] border border-[var(--rim)]">
              <div
                style={{ width: \`\${Math.max(stageMix.qual.pct, 4)}%\` }}
                className="bg-[#F2C94C] rounded-lg h-full transition-all hover:opacity-90"
                title={\`Qualification: \${formatCurrency(stageMix.qual.value, currency)} (\${stageMix.qual.pct}%)\`}
              />
              <div
                style={{ width: \`\${Math.max(stageMix.prop.pct, 4)}%\` }}
                className="bg-[#2F5C50] rounded-lg h-full transition-all hover:opacity-90"
                title={\`Proposal: \${formatCurrency(stageMix.prop.value, currency)} (\${stageMix.prop.pct}%)\`}
              />
              <div
                style={{ width: \`\${Math.max(stageMix.neg.pct, 4)}%\` }}
                className="bg-[#C8431F] rounded-lg h-full transition-all hover:opacity-90"
                title={\`Negotiation: \${formatCurrency(stageMix.neg.value, currency)} (\${stageMix.neg.pct}%)\`}
              />
              <div
                style={{ width: \`\${Math.max(stageMix.close.pct, 4)}%\` }}
                className="bg-[#17191A] rounded-lg h-full transition-all hover:opacity-90"
                title={\`Closing: \${formatCurrency(stageMix.close.value, currency)} (\${stageMix.close.pct}%)\`}
              />
            </div>
          </div>

          {/* Legend Items */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[var(--rim)] text-[14px]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F2C94C] shrink-0" />
              <div className="truncate">
                <span className="text-[var(--text)] font-medium block truncate">Qualification</span>
                <span className="text-[var(--muted)] text-[12px] block font-tabular">{formatCurrency(stageMix.qual.value, currency, { compact: true })}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2F5C50] shrink-0" />
              <div className="truncate">
                <span className="text-[var(--text)] font-medium block truncate">Proposal</span>
                <span className="text-[var(--muted)] text-[12px] block font-tabular">{formatCurrency(stageMix.prop.value, currency, { compact: true })}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C8431F] shrink-0" />
              <div className="truncate">
                <span className="text-[var(--text)] font-medium block truncate">Negotiation</span>
                <span className="text-[var(--muted)] text-[12px] block font-tabular">{formatCurrency(stageMix.neg.value, currency, { compact: true })}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#596C79] shrink-0" />
              <div className="truncate">
                <span className="text-[var(--text)] font-medium block truncate">Closing</span>
                <span className="text-[var(--muted)] text-[12px] block font-tabular">{formatCurrency(stageMix.close.value, currency, { compact: true })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/components/overview/OverviewView.tsx', headerPart + '\n' + newRenderBody, 'utf8');
console.log('Successfully updated OverviewView.tsx');

