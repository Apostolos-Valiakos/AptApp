// Rows normally run back-to-back; a row with `_manualStart` keeps the start
// time it was given instead. Once one row is pinned, every row after it is
// pinned too, so moving a row never shifts the rows that follow it.

export const pinStartTimes = (list: any[], fromIndex: number) => {
  for (let i = fromIndex; i < list.length; i++) list[i]._manualStart = true;
};

// Rows saved with a gap or overlap were positioned by hand, so re-pin them on
// load — otherwise the next recalc would snap them back into sequence.
export const markManualStarts = (list: any[]) => {
  for (let i = 1; i < list.length; i++) {
    const prevEnd =
      new Date(list[i - 1].start_time).getTime() +
      (list[i - 1].duration_override || 60) * 60000;
    if (new Date(list[i].start_time).getTime() !== prevEnd) {
      pinStartTimes(list, i);
      break;
    }
  }
  return list;
};
