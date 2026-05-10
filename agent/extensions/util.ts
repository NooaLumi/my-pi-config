function getEllipsis(frame: number): string {
   const frames = [".", "..", "..."];
   return frames[frame % frames.length];
}

export function withEllipsisAnimation(fn: (ellipsis: string) => void, intervalMs: number = 200) {
   let frame = 0;
   const interval = setInterval(() => {
      frame++;
      fn(getEllipsis(frame));
   }, intervalMs);

   return () => {
      clearInterval(interval);
   };
}

export enum Icon {
   Cogwheel,
   Record,
   Search,
}

export function getIcon(type: Icon): string {
   switch (type) {
      case Icon.Cogwheel:
         return "\uf013 ";
      case Icon.Record:
         return "\udb81\udc4a ";
      case Icon.Search:
         return "\udb81\udf0f ";
   }
}
