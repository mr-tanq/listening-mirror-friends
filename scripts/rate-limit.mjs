/**
 * Minimal sliding-window rate limiter for scheduled enrichment jobs.
 * createRateLimiter({max:40,perMs:5000}) allows at most 40 calls in any
 * rolling 5 second window; wait() resolves when the next call may start.
 */
export function createRateLimiter({max,perMs,clock=()=>Date.now(),delay=ms=>new Promise(r=>setTimeout(r,ms))}){
 const stamps=[];
 return {
  async wait(){
   for(;;){
    const now=clock();
    while(stamps.length&&now-stamps[0]>=perMs)stamps.shift();
    if(stamps.length<max){stamps.push(now);return;}
    await delay(Math.max(1,perMs-(now-stamps[0])));
   }
  }
 };
}
export const isoDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
