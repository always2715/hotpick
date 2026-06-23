function kstDateParts(date=new Date()){
  const shifted=new Date(date.getTime()+9*60*60*1000);
  return {
    year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate(),
    hour:shifted.getUTCHours(),minute:shifted.getUTCMinutes(),second:shifted.getUTCSeconds(),
  };
}

function ymdFromDate(date){
  const p=kstDateParts(date);
  return `${p.year}${String(p.month).padStart(2,'0')}${String(p.day).padStart(2,'0')}`;
}

export function resolveKmaBaseDateTime(now=new Date()){
  const p=kstDateParts(now);
  const slots=[2,5,8,11,14,17,20,23];
  const available=slots.filter(hour=>hour<p.hour||(hour===p.hour&&p.minute>=15));
  if(available.length){
    return {baseDate:ymdFromDate(now),baseTime:`${String(available.at(-1)).padStart(2,'0')}00`};
  }
  const previous=new Date(now.getTime()-24*60*60*1000);
  return {baseDate:ymdFromDate(previous),baseTime:'2300'};
}

export function resolveWeatherTargetDate(topicTitle='', now=new Date()){
  const offset=/내일|익일/.test(String(topicTitle))?1:0;
  return ymdFromDate(new Date(now.getTime()+offset*24*60*60*1000));
}
