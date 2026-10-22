// Dates in the company record (owner, 22 October 2026: every statement of
// the founder's is dated, so "I'm signing on Friday", said on 15 October,
// isn't read as next Friday). UK dates, in UK time.

const UK = 'Europe/London';

// "15 October 2026"; empty if there's no usable date.
export function dayOf(when: unknown) {
  const d = new Date(String(when ?? ''));
  if (!when || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: UK });
}

// The first line of the record, so "Friday" or "next month" in an older
// statement can be read against today.
export function todayLine(now = new Date()) {
  const day = `${now.toLocaleDateString('en-GB', { weekday: 'long', timeZone: UK })} ${dayOf(now.toISOString())}`;
  return `Today is ${day}. Everything the founder said below is dated: read "Friday", "next month" or "this week" against the day they said it, and if that day has passed, ask whether it still stands rather than treating it as still ahead.\n`;
}

// A record saved at the start of a meeting, with today's date: a follow-up
// days later must not be told the meeting day is today.
export function withToday(record: string | null | undefined, now = new Date()) {
  const r = String(record ?? '');
  return r.startsWith('Today is ') ? todayLine(now) + r.slice(r.indexOf('\n') + 1) : r;
}
