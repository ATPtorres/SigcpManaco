const timeZone = process.env.APP_TIME_ZONE || 'America/La_Paz';
function businessDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
function utcDate(value) {
  return businessDate(new Date(String(value).replace(' ', 'T') + 'Z'));
}
module.exports = { businessDate, utcDate };
